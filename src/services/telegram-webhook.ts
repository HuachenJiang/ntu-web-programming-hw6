import { loadAppConfig, type AppEnvironmentConfig } from "@/config/app";
import { AppError } from "@/errors/app-error";
import { TelegramApiError } from "@/errors/telegram-api-error";
import { logger, type Logger } from "@/lib/logger";
import { routeTelegramUpdate } from "@/services/telegram-router";
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

export async function handleTelegramWebhookRequest(
  request: Request,
  dependencies: TelegramWebhookDependencies = {},
): Promise<Response> {
  const activeLogger = dependencies.logger ?? logger;
  const config = dependencies.config ?? loadAppConfig();
  const requestSecret = request.headers.get(telegramWebhookSecretHeader);

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
  const routeResult = routeTelegramUpdate(update);

  activeLogger.info({
    event: "telegram_webhook_update_routed",
    updateId: update.update_id,
    route: routeResult.route,
    chatId: routeResult.chatId,
  });

  try {
    if (routeResult.callbackAnswer) {
      await telegramClient.answerCallbackQuery({
        callback_query_id: routeResult.callbackAnswer.callbackQueryId,
        text: routeResult.callbackAnswer.text,
        show_alert: routeResult.callbackAnswer.showAlert,
      });
    }

    if (routeResult.chatId !== null) {
      await telegramClient.sendMessage({
        chat_id: routeResult.chatId,
        text: routeResult.text,
        ...(routeResult.replyMarkup
          ? { reply_markup: routeResult.replyMarkup }
          : {}),
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
    activeLogger.error({
      event: "telegram_webhook_reply_failed",
      updateId: update.update_id,
      route: routeResult.route,
      chatId: routeResult.chatId,
      errorCode: getErrorCode(error),
      ...(error instanceof TelegramApiError
        ? {
            telegramStatus: error.status,
            telegramErrorCode: error.telegramErrorCode,
          }
        : {}),
    });

    return jsonResponse({ ok: false }, 502);
  }

  return jsonResponse({ ok: true }, 200);
}
