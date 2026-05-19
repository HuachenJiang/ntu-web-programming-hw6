import { loadAppConfig, type AppEnvironmentConfig } from "@/config/app";
import { AppError } from "@/errors/app-error";
import { DatabaseError } from "@/errors/database-error";
import { QwenApiError } from "@/errors/qwen-api-error";
import { TelegramApiError } from "@/errors/telegram-api-error";
import { logger, type Logger } from "@/lib/logger";
import {
  conversationRepository,
  type ConversationRepository,
  type PersistedConversationContext,
} from "@/repositories/conversation-repository";
import {
  errorLogRepository,
  type ErrorLogRepository,
  type ErrorLogSource,
} from "@/repositories/error-log-repository";
import { routeTelegramUpdate } from "@/services/telegram-router";
import {
  createAiReplyService,
  type AiReplyService,
} from "@/services/ai-reply-service";
import {
  createTelegramApiClient,
  type TelegramApiClient,
} from "@/services/telegram-api-client";
import type {
  TelegramCallbackQuery,
  TelegramChat,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from "@/types/telegram";

type TelegramWebhookDependencies = {
  config?: AppEnvironmentConfig;
  telegramClient?: TelegramApiClient;
  aiReplyService?: AiReplyService;
  conversationRepository?: ConversationRepository;
  errorLogRepository?: ErrorLogRepository;
  logger?: Logger;
};

type ParsedUpdate =
  | {
      ok: true;
      update: TelegramUpdate;
    }
  | {
      ok: false;
      reason: "invalid_json" | "invalid_update";
    };

const telegramWebhookSecretHeader = "x-telegram-bot-api-secret-token";
const databaseFallbackReply =
  "Sorry, I could not save the conversation right now. Please try again later.";
const aiFallbackReply =
  "Sorry, I could not generate an AI reply right now. Please try again later.";

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTelegramChat(value: unknown): TelegramChat | null {
  if (!isRecord(value) || typeof value.id !== "number") {
    return null;
  }

  return {
    id: value.id,
    ...(typeof value.type === "string" ? { type: value.type } : {}),
  };
}

function parseTelegramUser(value: unknown): TelegramUser | null {
  if (!isRecord(value) || typeof value.id !== "number") {
    return null;
  }

  return {
    id: value.id,
    ...(typeof value.is_bot === "boolean" ? { is_bot: value.is_bot } : {}),
    ...(typeof value.first_name === "string"
      ? { first_name: value.first_name }
      : {}),
    ...(typeof value.username === "string" ? { username: value.username } : {}),
  };
}

function parseTelegramMessage(value: unknown): TelegramMessage | null {
  if (!isRecord(value) || typeof value.message_id !== "number") {
    return null;
  }

  const chat = parseTelegramChat(value.chat);

  if (!chat) {
    return null;
  }

  const from = parseTelegramUser(value.from);

  return {
    message_id: value.message_id,
    chat,
    ...(from ? { from } : {}),
    ...(typeof value.date === "number" ? { date: value.date } : {}),
    ...(typeof value.text === "string" ? { text: value.text } : {}),
  };
}

function parseTelegramCallbackQuery(
  value: unknown,
): TelegramCallbackQuery | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const from = parseTelegramUser(value.from);

  if (!from) {
    return null;
  }

  const message = parseTelegramMessage(value.message);

  return {
    id: value.id,
    from,
    ...(message ? { message } : {}),
    ...(typeof value.data === "string" ? { data: value.data } : {}),
  };
}

async function parseTelegramUpdate(request: Request): Promise<ParsedUpdate> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
    };
  }

  if (!isRecord(payload) || typeof payload.update_id !== "number") {
    return {
      ok: false,
      reason: "invalid_update",
    };
  }

  const message = parseTelegramMessage(payload.message);
  const callbackQuery = parseTelegramCallbackQuery(payload.callback_query);

  return {
    ok: true,
    update: {
      update_id: payload.update_id,
      ...(message ? { message } : {}),
      ...(callbackQuery ? { callback_query: callbackQuery } : {}),
    },
  };
}

function getErrorCode(error: unknown): string {
  if (error instanceof AppError) {
    return error.code;
  }

  return "UNKNOWN_SERVER_ERROR";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown server error";
}

function getErrorLogSource(error: unknown): ErrorLogSource {
  if (error instanceof TelegramApiError) {
    return "telegram";
  }

  if (error instanceof DatabaseError) {
    return "database";
  }

  if (error instanceof QwenApiError) {
    return "qwen";
  }

  return "webhook";
}

function getErrorLogMetadata(
  error: unknown,
): Record<string, unknown> | undefined {
  if (error instanceof TelegramApiError) {
    return {
      telegramStatus: error.status,
      telegramErrorCode: error.telegramErrorCode,
    };
  }

  if (error instanceof QwenApiError) {
    return {
      qwenStatus: error.status,
      qwenErrorCode: error.qwenErrorCode,
      qwenResponseSummary: error.responseSummary,
    };
  }

  return undefined;
}

async function recordErrorLogSafely(
  repository: ErrorLogRepository,
  activeLogger: Logger,
  input: {
    error: unknown;
    updateId?: number;
    route?: string;
    chatId?: number | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await repository.recordErrorLog({
      source: getErrorLogSource(input.error),
      errorCode: getErrorCode(input.error),
      message: getErrorMessage(input.error),
      ...(input.updateId !== undefined ? { updateId: input.updateId } : {}),
      ...(input.chatId !== undefined ? { chatId: input.chatId } : {}),
      ...(input.route ? { route: input.route } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  } catch (error) {
    activeLogger.error({
      event: "telegram_webhook_error_log_failed",
      updateId: input.updateId,
      route: input.route,
      chatId: input.chatId,
      errorCode: getErrorCode(error),
    });
  }
}

export async function handleTelegramWebhookRequest(
  request: Request,
  dependencies: TelegramWebhookDependencies = {},
): Promise<Response> {
  const activeLogger = dependencies.logger ?? logger;
  const config = dependencies.config ?? loadAppConfig();
  const requestSecret = request.headers.get(telegramWebhookSecretHeader);
  const activeConversationRepository =
    dependencies.conversationRepository ?? conversationRepository;
  const activeErrorLogRepository =
    dependencies.errorLogRepository ?? errorLogRepository;

  if (requestSecret !== config.telegram.webhookSecret) {
    activeLogger.warn({
      event: "telegram_webhook_secret_rejected",
      errorCode: "INVALID_WEBHOOK_SECRET",
    });

    return jsonResponse({ ok: false }, 401);
  }

  const parsedUpdate = await parseTelegramUpdate(request);

  if (!parsedUpdate.ok) {
    activeLogger.warn({
      event: "telegram_webhook_payload_rejected",
      errorCode: parsedUpdate.reason,
    });

    return jsonResponse({ ok: false }, 400);
  }

  const { update } = parsedUpdate;
  const telegramClient =
    dependencies.telegramClient ?? createTelegramApiClient({ config });
  const aiReplyService =
    dependencies.aiReplyService ??
    createAiReplyService({
      config,
      conversationRepository: activeConversationRepository,
    });
  const routeResult = routeTelegramUpdate(update);
  let persistedContext: PersistedConversationContext = {
    conversationId: null,
    telegramUserId: null,
    chatId: routeResult.chatId,
  };

  activeLogger.info({
    event: "telegram_webhook_update_routed",
    updateId: update.update_id,
    route: routeResult.route,
    chatId: routeResult.chatId,
  });

  try {
    if (update.callback_query) {
      persistedContext =
        await activeConversationRepository.recordCallbackInteraction({
          update,
          route: routeResult.route,
          resetConversation: routeResult.effects?.resetConversation,
        });
    } else if (update.message) {
      persistedContext =
        await activeConversationRepository.recordIncomingMessage({
          update,
          route: routeResult.route,
          resetConversation: routeResult.effects?.resetConversation,
        });
    }
  } catch (error) {
    activeLogger.error({
      event: "telegram_webhook_persistence_failed",
      updateId: update.update_id,
      route: routeResult.route,
      chatId: routeResult.chatId,
      errorCode: getErrorCode(error),
    });

    await recordErrorLogSafely(activeErrorLogRepository, activeLogger, {
      error,
      updateId: update.update_id,
      route: routeResult.route,
      chatId: routeResult.chatId,
    });

    if (routeResult.chatId !== null) {
      try {
        await telegramClient.sendMessage({
          chat_id: routeResult.chatId,
          text: databaseFallbackReply,
        });
      } catch (replyError) {
        activeLogger.error({
          event: "telegram_webhook_database_fallback_reply_failed",
          updateId: update.update_id,
          route: routeResult.route,
          chatId: routeResult.chatId,
          errorCode: getErrorCode(replyError),
        });
      }
    }

    return jsonResponse({ ok: false }, 500);
  }

  try {
    if (routeResult.callbackAnswer) {
      await telegramClient.answerCallbackQuery({
        callback_query_id: routeResult.callbackAnswer.callbackQueryId,
        text: routeResult.callbackAnswer.text,
        show_alert: routeResult.callbackAnswer.showAlert,
      });
    }

    if (routeResult.chatId !== null) {
      let replyText = routeResult.text;

      if (routeResult.aiInput) {
        try {
          replyText = await aiReplyService.generateReply({
            context: persistedContext,
            currentUserText: routeResult.aiInput.text,
            currentUpdateId: update.update_id,
          });
        } catch (error) {
          if (error instanceof DatabaseError) {
            throw error;
          }

          activeLogger.error({
            event: "telegram_webhook_ai_reply_failed",
            updateId: update.update_id,
            route: routeResult.route,
            chatId: routeResult.chatId,
            errorCode: getErrorCode(error),
            ...(error instanceof QwenApiError
              ? {
                  qwenStatus: error.status,
                  qwenErrorCode: error.qwenErrorCode,
                }
              : {}),
          });
          await recordErrorLogSafely(activeErrorLogRepository, activeLogger, {
            error,
            updateId: update.update_id,
            route: routeResult.route,
            chatId: routeResult.chatId,
            metadata: getErrorLogMetadata(error),
          });

          replyText = aiFallbackReply;
        }
      }

      await telegramClient.sendMessage({
        chat_id: routeResult.chatId,
        text: replyText,
        ...(routeResult.replyMarkup
          ? { reply_markup: routeResult.replyMarkup }
          : {}),
      });
      await activeConversationRepository.recordBotReply({
        ...persistedContext,
        updateId: update.update_id,
        route: routeResult.route,
        text: replyText,
      });
    } else {
      activeLogger.warn({
        event: "telegram_webhook_missing_chat",
        updateId: update.update_id,
        route: routeResult.route,
        chatId: routeResult.chatId,
      });
    }
  } catch (error) {
    const isDatabaseError = error instanceof DatabaseError;

    activeLogger.error({
      event: isDatabaseError
        ? "telegram_webhook_persistence_failed"
        : "telegram_webhook_reply_failed",
      updateId: update.update_id,
      route: routeResult.route,
      chatId: routeResult.chatId,
      errorCode: getErrorCode(error),
      ...getErrorLogMetadata(error),
    });
    await recordErrorLogSafely(activeErrorLogRepository, activeLogger, {
      error,
      updateId: update.update_id,
      route: routeResult.route,
      chatId: routeResult.chatId,
      metadata: getErrorLogMetadata(error),
    });

    return jsonResponse({ ok: false }, isDatabaseError ? 500 : 502);
  }

  return jsonResponse({ ok: true }, 200);
}
