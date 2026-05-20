import { AppError } from "@/errors/app-error";

export class UserRateLimitError extends AppError {
  constructor(readonly retryAfterMs: number) {
    super(
      "User exceeded the configured message rate limit",
      "USER_RATE_LIMITED",
    );
    this.name = "UserRateLimitError";
  }
}
