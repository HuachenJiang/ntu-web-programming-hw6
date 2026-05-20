import { loadAppConfig, type AppEnvironmentConfig } from "@/config/app";
import { DatabaseError } from "@/errors/database-error";
import { describeError, getErrorCode } from "@/errors/error-handler";
import { UserRateLimitError } from "@/errors/rate-limit-error";
import { logger, type Logger } from "@/lib/logger";
import {
  conversationRepository,
  type ConversationRepository,
  type PersistedConversationContext,
} from "@/repositories/conversation-repository";
import {
  errorLogRepository,
  type ErrorLogRepository,
} from "@/repositories/error-log-repository";
import {
  getDefaultUserRateLimiter,
  type RateLimiter,
} from "@/services/rate-limiter";
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
  rateLimiter?: RateLimiter;
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
const typingRefreshIntervalMs = 4000;

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
  const descriptor = describeError(input.error);
  const metadata = {
    ...descriptor.metadata,
    ...input.metadata,
  };

  try {
    await repository.recordErrorLog({
      source: descriptor.source,
      errorCode: descriptor.errorCode,
      message: descriptor.message,
      ...(input.updateId !== undefined ? { updateId: input.updateId } : {}),
      ...(input.chatId !== undefined ? { chatId: input.chatId } : {}),
      ...(input.route ? { route: input.route } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
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

type TypingIndicatorInput = {
  chatId: number;
  updateId: number;
  route: string;
};

async function sendTypingSafely(
  telegramClient: TelegramApiClient,
  activeLogger: Logger,
  input: TypingIndicatorInput,
): Promise<void> {
  try {
    await telegramClient.sendChatAction({
      chat_id: input.chatId,
      action: "typing",
    });
  } catch (error) {
    activeLogger.warn({
      event: "telegram_webhook_typing_failed",
      updateId: input.updateId,
      route: input.route,
      chatId: input.chatId,
      errorCode: getErrorCode(error),
    });
  }
}

function startTypingIndicator(
  telegramClient: TelegramApiClient,
  activeLogger: Logger,
  input: TypingIndicatorInput,
): () => void {
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  interval = setInterval(() => {
    if (!stopped) {
      void sendTypingSafely(telegramClient, activeLogger, input);
    }
  }, typingRefreshIntervalMs);

  return () => {
    stopped = true;

    if (interval !== null) {
      clearInterval(interval);
    }
  };
}

function getAiRateLimitUserKey(
  update: TelegramUpdate,
  context: PersistedConversationContext,
  chatId: number | null,
): string | null {
  const telegramUserId = update.message?.from?.id ?? context.telegramUserId;

  if (typeof telegramUserId === "number") {
    return `user:${telegramUserId}`;
  }

  const fallbackChatId = chatId ?? context.chatId;

  if (typeof fallbackChatId === "number") {
    return `chat:${fallbackChatId}`;
  }

  return null;
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
  const activeRateLimiter =
    dependencies.rateLimiter ?? getDefaultUserRateLimiter(config);

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
    const descriptor = describeError(error);

    activeLogger.error({
      event: "telegram_webhook_persistence_failed",
      updateId: update.update_id,
      route: routeResult.route,
      chatId: routeResult.chatId,
      errorCode: descriptor.errorCode,
      ...descriptor.metadata,
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
          text: descriptor.fallbackReply ?? routeResult.text,
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

    return jsonResponse({ ok: false }, descriptor.httpStatus);
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
        let shouldGenerateAiReply = true;
        const rateLimitUserKey = getAiRateLimitUserKey(
          update,
          persistedContext,
          routeResult.chatId,
        );

        if (rateLimitUserKey) {
          const rateLimitResult = activeRateLimiter.check({
            userKey: rateLimitUserKey,
          });

          if (!rateLimitResult.allowed) {
            const error = new UserRateLimitError(rateLimitResult.retryAfterMs);
            const descriptor = describeError(error);

            activeLogger.warn({
              event: "telegram_webhook_user_rate_limited",
              updateId: update.update_id,
              route: routeResult.route,
              chatId: routeResult.chatId,
              errorCode: descriptor.errorCode,
              retryAfterMs: rateLimitResult.retryAfterMs,
            });
            await recordErrorLogSafely(activeErrorLogRepository, activeLogger, {
              error,
              updateId: update.update_id,
              route: routeResult.route,
              chatId: routeResult.chatId,
            });

            replyText = descriptor.fallbackReply ?? routeResult.text;
            shouldGenerateAiReply = false;
          }
        }

        if (shouldGenerateAiReply) {
          const typingInput = {
            chatId: routeResult.chatId,
            updateId: update.update_id,
            route: routeResult.route,
          };

          await sendTypingSafely(telegramClient, activeLogger, typingInput);
          const stopTyping = startTypingIndicator(
            telegramClient,
            activeLogger,
            typingInput,
          );

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

            const descriptor = describeError(error);

            activeLogger.error({
              event: "telegram_webhook_ai_reply_failed",
              updateId: update.update_id,
              route: routeResult.route,
              chatId: routeResult.chatId,
              errorCode: descriptor.errorCode,
              ...descriptor.metadata,
            });
            await recordErrorLogSafely(activeErrorLogRepository, activeLogger, {
              error,
              updateId: update.update_id,
              route: routeResult.route,
              chatId: routeResult.chatId,
            });

            replyText = descriptor.fallbackReply ?? routeResult.text;
          } finally {
            stopTyping();
          }
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
    const descriptor = describeError(error);

    activeLogger.error({
      event:
        descriptor.source === "database"
          ? "telegram_webhook_persistence_failed"
          : "telegram_webhook_reply_failed",
      updateId: update.update_id,
      route: routeResult.route,
      chatId: routeResult.chatId,
      errorCode: descriptor.errorCode,
      ...descriptor.metadata,
    });
    await recordErrorLogSafely(activeErrorLogRepository, activeLogger, {
      error,
      updateId: update.update_id,
      route: routeResult.route,
      chatId: routeResult.chatId,
    });

    return jsonResponse({ ok: false }, descriptor.httpStatus);
  }

  return jsonResponse({ ok: true }, 200);
}
