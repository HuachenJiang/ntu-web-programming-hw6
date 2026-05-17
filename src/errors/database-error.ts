import { AppError } from "@/errors/app-error";

export class DatabaseError extends AppError {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, "DATABASE_FAILED");
    this.name = "DatabaseError";
  }
}
