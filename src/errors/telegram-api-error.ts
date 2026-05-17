import { AppError } from "@/errors/app-error";

export class TelegramApiError extends AppError {
  constructor(
    message: string,
    readonly status?: number,
    readonly telegramErrorCode?: number,
  ) {
    super(message, "TELEGRAM_API_FAILED");
    this.name = "TelegramApiError";
  }
}
