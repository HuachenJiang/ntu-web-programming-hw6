import { describe, expect, it, vi } from "vitest";
import type { AppEnvironmentConfig } from "@/config/app";
import { TelegramApiError } from "@/errors/telegram-api-error";
import type { Logger } from "@/lib/logger";
import { createTelegramApiClient } from "@/services/telegram-api-client";

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

function telegramResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function createLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("createTelegramApiClient", () => {
  it("posts sendMessage requests to Telegram Bot API", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(telegramResponse({ ok: true, result: true }));
    const client = createTelegramApiClient({ config, fetchImpl });

    await client.sendMessage({
      chat_id: 1001,
      text: "Hello",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123456789:test-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chat_id: 1001,
          text: "Hello",
        }),
      }),
    );
  });

  it("posts sendChatAction typing requests to Telegram Bot API", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(telegramResponse({ ok: true, result: true }));
    const client = createTelegramApiClient({ config, fetchImpl });

    await client.sendChatAction({
      chat_id: 1001,
      action: "typing",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123456789:test-token/sendChatAction",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chat_id: 1001,
          action: "typing",
        }),
      }),
    );
  });

  it("throws TelegramApiError when Telegram returns ok=false", async () => {
    const testLogger = createLogger();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      telegramResponse({
        ok: false,
        error_code: 400,
        description: "Bad Request",
      }),
    );
    const client = createTelegramApiClient({
      config,
      fetchImpl,
      logger: testLogger,
    });

    await expect(
      client.answerCallbackQuery({
        callback_query_id: "callback-1",
        text: "Selected",
      }),
    ).rejects.toMatchObject({
      name: "TelegramApiError",
      code: "TELEGRAM_API_FAILED",
      telegramErrorCode: 400,
    } satisfies Partial<TelegramApiError>);
    expect(testLogger.error).toHaveBeenCalledWith({
      event: "telegram_api_request_failed",
      errorCode: "TELEGRAM_API_FAILED",
      method: "answerCallbackQuery",
      status: 200,
      telegramErrorCode: 400,
    });
  });

  it("wraps network failures as TelegramApiError", async () => {
    const testLogger = createLogger();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("network failed"));
    const client = createTelegramApiClient({
      config,
      fetchImpl,
      logger: testLogger,
    });

    await expect(
      client.sendMessage({
        chat_id: 1001,
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      name: "TelegramApiError",
      code: "TELEGRAM_API_FAILED",
    } satisfies Partial<TelegramApiError>);
    expect(testLogger.error).toHaveBeenCalledWith({
      event: "telegram_api_request_failed",
      errorCode: "TELEGRAM_API_FAILED",
      method: "sendMessage",
      status: null,
      telegramErrorCode: null,
    });
  });
});
