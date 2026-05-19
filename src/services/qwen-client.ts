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

export function createQwenClient(options: QwenClientOptions = {}): QwenClient {
  const config = options.config ?? loadAppConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const activeLogger = options.logger ?? logger;

  return {
    async generateChatCompletion(input) {
      let response: Response;

      try {
        response = await fetchImpl(buildEndpoint(config.qwen.apiBaseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.qwen.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            messages: input.messages,
          }),
        });
      } catch {
        activeLogger.error({
          event: "qwen_api_request_failed",
          errorCode: "QWEN_API_FAILED",
          status: null,
        });

        throw new QwenApiError("Qwen API request failed", undefined, undefined);
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const qwenErrorCode = readErrorCode(payload);
        const responseSummary = readResponseSummary(payload);

        activeLogger.error({
          event: "qwen_api_request_failed",
          errorCode: "QWEN_API_FAILED",
          status: response.status,
          qwenErrorCode: qwenErrorCode ?? null,
        });

        throw new QwenApiError(
          `Qwen API failed with HTTP ${response.status}`,
          response.status,
          qwenErrorCode,
          responseSummary,
        );
      }

      const content = readCompletionContent(payload);

      if (typeof content !== "string" || content.trim().length === 0) {
        throw new QwenApiError(
          "Qwen API returned an invalid chat completion response",
          response.status,
        );
      }

      return content.trim();
    },
  };
}
