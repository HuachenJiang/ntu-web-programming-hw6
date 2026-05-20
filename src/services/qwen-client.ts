import { loadAppConfig, type AppEnvironmentConfig } from "@/config/app";
import { QwenApiError } from "@/errors/qwen-api-error";
import { logger, type Logger } from "@/lib/logger";

export type QwenChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerateChatCompletionInput = {
  model: string;
  messages: QwenChatMessage[];
};

export type QwenClient = {
  generateChatCompletion(input: GenerateChatCompletionInput): Promise<string>;
};

type QwenClientOptions = {
  config?: AppEnvironmentConfig;
  fetchImpl?: typeof fetch;
  logger?: Logger;
};

const qwenRequestTimeoutMs = 30000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readResponseSummary(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const error = payload.error;

  if (!isRecord(error)) {
    return undefined;
  }

  const message = typeof error.message === "string" ? error.message : "";
  const code = typeof error.code === "string" ? error.code : "";

  return [code, message].filter(Boolean).join(": ") || undefined;
}

function readErrorCode(payload: unknown): string | undefined {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return undefined;
  }

  return typeof payload.error.code === "string"
    ? payload.error.code
    : undefined;
}

function readCompletionContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const firstChoice = payload.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null;
  }

  return typeof firstChoice.message.content === "string"
    ? firstChoice.message.content
    : null;
}

function buildEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ||
    (isRecord(error) && typeof error.name === "string")
    ? error.name === "AbortError"
    : false;
}

function hasQuotaSignal(...values: Array<string | undefined>): boolean {
  return values
    .filter((value): value is string => typeof value === "string")
    .some((value) => {
      const normalized = value.toLowerCase();

      return (
        normalized.includes("quota") ||
        normalized.includes("usage limit") ||
        normalized.includes("usage_limit") ||
        normalized.includes("insufficient balance") ||
        normalized.includes("insufficient_balance") ||
        normalized.includes("allocated limit")
      );
    });
}

function resolveQwenErrorKind(
  status: number,
  qwenErrorCode: string | undefined,
  responseSummary: string | undefined,
): QwenApiError["kind"] {
  if (status === 429) {
    return "rate_limited";
  }

  if (hasQuotaSignal(qwenErrorCode, responseSummary)) {
    return "quota_exceeded";
  }

  return "api_failed";
}

export function createQwenClient(options: QwenClientOptions = {}): QwenClient {
  const config = options.config ?? loadAppConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const activeLogger = options.logger ?? logger;

  return {
    async generateChatCompletion(input) {
      let response: Response;
      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        abortController.abort();
      }, qwenRequestTimeoutMs);

      try {
        response = await fetchImpl(buildEndpoint(config.qwen.apiBaseUrl), {
          method: "POST",
          signal: abortController.signal,
          headers: {
            authorization: `Bearer ${config.qwen.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            messages: input.messages,
          }),
        });
      } catch (error) {
        const isTimeout = isAbortError(error);
        activeLogger.error({
          event: "qwen_api_request_failed",
          errorCode: isTimeout ? "QWEN_API_TIMEOUT" : "QWEN_API_FAILED",
          status: null,
        });

        throw new QwenApiError(
          isTimeout ? "Qwen API request timed out" : "Qwen API request failed",
          undefined,
          undefined,
          undefined,
          isTimeout ? "timeout" : "api_failed",
        );
      } finally {
        clearTimeout(timeout);
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const qwenErrorCode = readErrorCode(payload);
        const responseSummary = readResponseSummary(payload);
        const kind = resolveQwenErrorKind(
          response.status,
          qwenErrorCode,
          responseSummary,
        );

        activeLogger.error({
          event: "qwen_api_request_failed",
          errorCode:
            kind === "rate_limited"
              ? "QWEN_API_RATE_LIMITED"
              : kind === "quota_exceeded"
                ? "QWEN_API_QUOTA_EXCEEDED"
                : "QWEN_API_FAILED",
          status: response.status,
          qwenErrorCode: qwenErrorCode ?? null,
        });

        throw new QwenApiError(
          `Qwen API failed with HTTP ${response.status}`,
          response.status,
          qwenErrorCode,
          responseSummary,
          kind,
        );
      }

      const content = readCompletionContent(payload);

      if (typeof content !== "string" || content.trim().length === 0) {
        throw new QwenApiError(
          "Qwen API returned an invalid chat completion response",
          response.status,
          undefined,
          undefined,
          "invalid_response",
        );
      }

      return content.trim();
    },
  };
}
