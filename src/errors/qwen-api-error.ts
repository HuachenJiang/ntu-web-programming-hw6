import { AppError } from "@/errors/app-error";

export type QwenApiErrorKind =
  | "timeout"
  | "quota_exceeded"
  | "rate_limited"
  | "api_failed"
  | "invalid_response";

const qwenErrorCodes: Record<QwenApiErrorKind, string> = {
  timeout: "QWEN_API_TIMEOUT",
  quota_exceeded: "QWEN_API_QUOTA_EXCEEDED",
  rate_limited: "QWEN_API_RATE_LIMITED",
  api_failed: "QWEN_API_FAILED",
  invalid_response: "QWEN_API_INVALID_RESPONSE",
};

export class QwenApiError extends AppError {
  constructor(
    message: string,
    readonly status?: number,
    readonly qwenErrorCode?: string,
    readonly responseSummary?: string,
    readonly kind: QwenApiErrorKind = "api_failed",
  ) {
    super(message, qwenErrorCodes[kind]);
    this.name = "QwenApiError";
  }
}
