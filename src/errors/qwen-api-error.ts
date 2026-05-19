import { AppError } from "@/errors/app-error";

export class QwenApiError extends AppError {
  constructor(
    message: string,
    readonly status?: number,
    readonly qwenErrorCode?: string,
    readonly responseSummary?: string,
  ) {
    super(message, "QWEN_API_FAILED");
    this.name = "QwenApiError";
  }
}
