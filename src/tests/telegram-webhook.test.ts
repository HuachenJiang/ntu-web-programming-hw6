import { describe, expect, it, vi } from "vitest";
import type { AppEnvironmentConfig } from "@/config/app";
import { TelegramApiError } from "@/errors/telegram-api-error";
import { BOT_CALLBACK_DATA, BOT_SCRIPTED_REPLIES } from "@/lib/bot-scripts";
import type { Logger } from "@/lib/logger";
import { handleTelegramWebhookRequest } from "@/services/telegram-webhook";
import type { TelegramApiClient } from "@/services/telegram-api-client";

const webhookUrl = "https://example.test/api/telegram/webhook";

const config: AppEnvironmentConfig = {
  telegram: {
    botToken: "123456789:test-token",
    webhookSecret: "test-secret",
  },
  qwen: {
    apiKey: "sk-qwen-test",
    model: "qwen-plus",
    apiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  mongodb: {
    uri: "mongodb+srv://user:password@example.mongodb.net/test",
  },
  app: {
    publicUrl: "https://example.ngrok-free.app",
  },
  admin: {
    pollingIntervalMs: 5000,
  },
  rateLimit: {
    userWindowMs: 60000,
    userMaxMessages: 20,
  },
  conversation: {
    recentContextMessageLimit: 10,
  },
};

function createLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createTelegramClient(): TelegramApiClient & {
  calls: string[];
} {
  const calls: string[] = [];

  return {
    calls,
    sendMessage: vi.fn(async () => {
      calls.push("sendMessage");
      return true;
    }),
    answerCallbackQuery: vi.fn(async () => {
      calls.push("answerCallbackQuery");
      return true;
    }),
  };
}

function request(body: unknown, secret = "test-secret"): Request {
  return new Request(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify(body),
  });
}

function invalidJsonRequest(secret = "test-secret"): Request {
  return new Request(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: "{",
  });
}

async function handle(
  req: Request,
  telegramClient = createTelegramClient(),
  testLogger = createLogger(),
): Promise<Response> {
  return handleTelegramWebhookRequest(req, {
    config,
    telegramClient,
    logger: testLogger,
  });
}

describe("handleTelegramWebhookRequest", () => {
  it("accepts a valid /start message and sends a Telegram reply", async () => {
    const telegramClient = createTelegramClient();

    const response = await handle(
      request({
        update_id: 1,
        message: {
          message_id: 10,
          chat: {
            id: 1001,
            type: "private",
          },
          text: "/start",
        },
      }),
      telegramClient,
    );

    expect(response.status).toBe(200);
    expect(telegramClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 1001,
        text: BOT_SCRIPTED_REPLIES.start,
        reply_markup: expect.any(Object),
      }),
    );
  });

  it("answers callback queries before sending the route reply", async () => {
    const telegramClient = createTelegramClient();

    const response = await handle(
      request({
        update_id: 2,
        callback_query: {
          id: "callback-1",
          from: {
            id: 2002,
            first_name: "Test",
          },
          message: {
            message_id: 11,
            chat: {
              id: 1001,
              type: "private",
            },
          },
          data: BOT_CALLBACK_DATA.help,
        },
      }),
      telegramClient,
    );

    expect(response.status).toBe(200);
    expect(telegramClient.calls).toEqual([
      "answerCallbackQuery",
      "sendMessage",
    ]);
    expect(telegramClient.answerCallbackQuery).toHaveBeenCalledWith({
      callback_query_id: "callback-1",
      text: "Help selected.",
      show_alert: undefined,
    });
  });

  it("rejects missing or incorrect webhook secrets before Telegram calls", async () => {
    const telegramClient = createTelegramClient();

    const response = await handle(
      request(
        {
          update_id: 3,
          message: {
            message_id: 12,
            chat: {
              id: 1001,
            },
            text: "/help",
          },
        },
        "wrong-secret",
      ),
      telegramClient,
    );

    expect(response.status).toBe(401);
    expect(telegramClient.sendMessage).not.toHaveBeenCalled();
    expect(telegramClient.answerCallbackQuery).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const telegramClient = createTelegramClient();

    const response = await handle(invalidJsonRequest(), telegramClient);

    expect(response.status).toBe(400);
    expect(telegramClient.sendMessage).not.toHaveBeenCalled();
  });

  it("returns 400 when update_id is missing", async () => {
    const telegramClient = createTelegramClient();

    const response = await handle(
      request({
        message: {
          message_id: 13,
          chat: {
            id: 1001,
          },
          text: "/start",
        },
      }),
      telegramClient,
    );

    expect(response.status).toBe(400);
    expect(telegramClient.sendMessage).not.toHaveBeenCalled();
  });

  it("sends unsupported copy for non-text messages with a chat", async () => {
    const telegramClient = createTelegramClient();

    const response = await handle(
      request({
        update_id: 4,
        message: {
          message_id: 14,
          chat: {
            id: 1001,
          },
        },
      }),
      telegramClient,
    );

    expect(response.status).toBe(200);
    expect(telegramClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 1001,
        text: BOT_SCRIPTED_REPLIES.unsupported,
      }),
    );
  });

  it("returns 502 and logs when Telegram API replies fail", async () => {
    const telegramClient = createTelegramClient();
    const testLogger = createLogger();
    vi.mocked(telegramClient.sendMessage).mockRejectedValueOnce(
      new TelegramApiError("Telegram failed", 500, 500),
    );

    const response = await handle(
      request({
        update_id: 5,
        message: {
          message_id: 15,
          chat: {
            id: 1001,
          },
          text: "/help",
        },
      }),
      telegramClient,
      testLogger,
    );

    expect(response.status).toBe(502);
    expect(testLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "telegram_webhook_reply_failed",
        updateId: 5,
        route: "help",
        chatId: 1001,
        errorCode: "TELEGRAM_API_FAILED",
      }),
    );
  });
});
