import { AppError } from "@/errors/app-error";
import { DatabaseError } from "@/errors/database-error";
import { QwenApiError } from "@/errors/qwen-api-error";
import { UserRateLimitError } from "@/errors/rate-limit-error";
import { TelegramApiError } from "@/errors/telegram-api-error";
import type { ErrorLogSource } from "@/repositories/error-log-repository";

export const ERROR_FALLBACK_REPLIES = {
  database:
    "Sorry, I could not save the conversation right now. Please try again later.",
  qwenDefault:
    "Sorry, I could not generate an AI reply right now. Please try again later.",
  qwenTimeout:
    "The AI service is taking too long to respond. Please try again later.",
  qwenQuota:
    "The AI service has reached its current usage limit. Please try again later.",
  qwenRateLimited:
    "The AI service is receiving too many requests right now. Please wait a moment and try again.",
  userRateLimited:
    "You are sending messages too quickly. Please wait a moment and try again.",
  unknown:
    "Sorry, something went wrong while processing your message. Please try again later.",
} as const;

export type ErrorDescriptor = {
  source: ErrorLogSource;
  errorCode: string;
  message: string;
  httpStatus: number;
  fallbackReply?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export function getErrorCode(error: unknown): string {
  if (error instanceof AppError) {
    return error.code;
  }

  return "UNKNOWN_SERVER_ERROR";
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown server error";
}

function getQwenFallbackReply(error: QwenApiError): string {
  if (error.kind === "quota_exceeded") {
    return ERROR_FALLBACK_REPLIES.qwenQuota;
  }

  if (error.kind === "rate_limited") {
    return ERROR_FALLBACK_REPLIES.qwenRateLimited;
  }

  if (error.kind === "timeout") {
    return ERROR_FALLBACK_REPLIES.qwenTimeout;
  }

  return ERROR_FALLBACK_REPLIES.qwenDefault;
}

export function describeError(error: unknown): ErrorDescriptor {
  if (error instanceof TelegramApiError) {
    return {
      source: "telegram",
      errorCode: error.code,
      message: error.message,
      httpStatus: 502,
      metadata: {
        telegramStatus: error.status,
        telegramErrorCode: error.telegramErrorCode,
      },
    };
  }

  if (error instanceof DatabaseError) {
    return {
      source: "database",
      errorCode: error.code,
      message: error.message,
      httpStatus: 500,
      fallbackReply: ERROR_FALLBACK_REPLIES.database,
    };
  }

  if (error instanceof QwenApiError) {
    return {
      source: "qwen",
      errorCode: error.code,
      message: error.message,
      httpStatus: 200,
      fallbackReply: getQwenFallbackReply(error),
      metadata: {
        qwenKind: error.kind,
        qwenStatus: error.status,
        qwenErrorCode: error.qwenErrorCode,
        qwenResponseSummary: error.responseSummary,
      },
    };
  }

  if (error instanceof UserRateLimitError) {
    return {
      source: "webhook",
      errorCode: error.code,
      message: error.message,
      httpStatus: 200,
      fallbackReply: ERROR_FALLBACK_REPLIES.userRateLimited,
      metadata: {
        retryAfterMs: error.retryAfterMs,
      },
    };
  }

  return {
    source: "webhook",
    errorCode: getErrorCode(error),
    message: getErrorMessage(error),
    httpStatus: 500,
    fallbackReply: ERROR_FALLBACK_REPLIES.unknown,
  };
}
