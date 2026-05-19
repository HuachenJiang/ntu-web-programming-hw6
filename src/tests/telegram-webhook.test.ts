import { describe, expect, it, vi } from "vitest";
import type { AppEnvironmentConfig } from "@/config/app";
import { DatabaseError } from "@/errors/database-error";
import { QwenApiError } from "@/errors/qwen-api-error";
import { TelegramApiError } from "@/errors/telegram-api-error";
import { BOT_CALLBACK_DATA, BOT_SCRIPTED_REPLIES } from "@/lib/bot-scripts";
import type { Logger } from "@/lib/logger";
import type {
  ConversationRepository,
  PersistedMessage,
  RecordBotReplyInput,
  RecordCallbackInteractionInput,
  RecordIncomingMessageInput,
} from "@/repositories/conversation-repository";
import type {
  ErrorLogRepository,
  RecordErrorLogInput,
} from "@/repositories/error-log-repository";
import type {
  AiReplyService,
  GenerateAiReplyInput,
} from "@/services/ai-reply-service";
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

function createConversationRepository(): ConversationRepository & {
  calls: string[];
  incomingMessages: RecordIncomingMessageInput[];
  callbackInteractions: RecordCallbackInteractionInput[];
  botReplies: RecordBotReplyInput[];
  recentMessages: PersistedMessage[];
  latestModeSelection: "ai_answer" | "quiz_me" | "study_plan" | null;
} {
  const calls: string[] = [];
  const incomingMessages: RecordIncomingMessageInput[] = [];
  const callbackInteractions: RecordCallbackInteractionInput[] = [];
  const botReplies: RecordBotReplyInput[] = [];
  const recentMessages: PersistedMessage[] = [];

  return {
    calls,
    incomingMessages,
    callbackInteractions,
    botReplies,
    recentMessages,
    latestModeSelection: null,
    recordIncomingMessage: vi.fn(async (input) => {
      calls.push("recordIncomingMessage");
      incomingMessages.push(input);

      return {
        conversationId: "conversation-1",
        telegramUserId: input.update.message?.from?.id ?? 1001,
        chatId: input.update.message?.chat.id ?? 1001,
      };
    }),
    recordCallbackInteraction: vi.fn(async (input) => {
      calls.push("recordCallbackInteraction");
      callbackInteractions.push(input);

      return {
        conversationId: "conversation-1",
        telegramUserId: input.update.callback_query?.from.id ?? 2002,
        chatId: input.update.callback_query?.message?.chat.id ?? 1001,
      };
    }),
    recordBotReply: vi.fn(async (input) => {
      calls.push("recordBotReply");
      botReplies.push(input);
    }),
    findMessagesByTelegramUserId: vi.fn(async () => []),
    findMessagesByDateRange: vi.fn(async () => []),
    searchMessagesByText: vi.fn(async () => []),
    findRecentMessagesByConversationId: vi.fn(async () => recentMessages),
    findLatestModeSelectionByConversationId: vi.fn(async () => null),
  };
}

function createAiReplyService(reply = "AI generated reply"): AiReplyService & {
  requests: GenerateAiReplyInput[];
} {
  const requests: GenerateAiReplyInput[] = [];

  return {
    requests,
    generateReply: vi.fn(async (input) => {
      requests.push(input);
      return reply;
    }),
  };
}

function createErrorLogRepository(): ErrorLogRepository & {
  logs: RecordErrorLogInput[];
} {
  const logs: RecordErrorLogInput[] = [];

  return {
    logs,
    recordErrorLog: vi.fn(async (input) => {
      logs.push(input);
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
  repositories = {
    conversationRepository: createConversationRepository(),
    errorLogRepository: createErrorLogRepository(),
  },
  aiReplyService = createAiReplyService(),
): Promise<Response> {
  return handleTelegramWebhookRequest(req, {
    config,
    telegramClient,
    aiReplyService,
    logger: testLogger,
    conversationRepository: repositories.conversationRepository,
    errorLogRepository: repositories.errorLogRepository,
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

  it("persists inbound text messages and bot replies", async () => {
    const telegramClient = createTelegramClient();
    const conversationRepo = createConversationRepository();
    const aiReplyService = createAiReplyService(
      "Use integration by parts with u and dv.",
    );

    const response = await handle(
      request({
        update_id: 20,
        message: {
          message_id: 30,
          chat: {
            id: 1001,
            type: "private",
          },
          from: {
            id: 2002,
            first_name: "Ada",
            username: "ada",
          },
          date: 1710000000,
          text: "Explain integration by parts.",
        },
      }),
      telegramClient,
      createLogger(),
      {
        conversationRepository: conversationRepo,
        errorLogRepository: createErrorLogRepository(),
      },
      aiReplyService,
    );

    expect(response.status).toBe(200);
    expect(conversationRepo.calls).toEqual([
      "recordIncomingMessage",
      "recordBotReply",
    ]);
    expect(conversationRepo.incomingMessages[0]).toMatchObject({
      route: "ai_answer",
      resetConversation: undefined,
    });
    expect(aiReplyService.generateReply).toHaveBeenCalledWith({
      context: {
        conversationId: "conversation-1",
        telegramUserId: 2002,
        chatId: 1001,
      },
      currentUserText: "Explain integration by parts.",
      currentUpdateId: 20,
    });
    expect(telegramClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 1001,
        text: "Use integration by parts with u and dv.",
      }),
    );
    expect(conversationRepo.botReplies[0]).toMatchObject({
      conversationId: "conversation-1",
      telegramUserId: 2002,
      chatId: 1001,
      updateId: 20,
      route: "ai_answer",
      text: "Use integration by parts with u and dv.",
    });
  });

  it("logs Qwen failures, sends an AI fallback, and keeps the webhook successful", async () => {
    const telegramClient = createTelegramClient();
    const testLogger = createLogger();
    const conversationRepo = createConversationRepository();
    const errorLogRepo = createErrorLogRepository();
    const aiReplyService = createAiReplyService();
    vi.mocked(aiReplyService.generateReply).mockRejectedValueOnce(
      new QwenApiError("Qwen unavailable", 503, "ServiceUnavailable"),
    );

    const response = await handle(
      request({
        update_id: 23,
        message: {
          message_id: 33,
          chat: {
            id: 1001,
            type: "private",
          },
          from: {
            id: 2002,
            first_name: "Ada",
          },
          text: "Explain vectors.",
        },
      }),
      telegramClient,
      testLogger,
      {
        conversationRepository: conversationRepo,
        errorLogRepository: errorLogRepo,
      },
      aiReplyService,
    );

    expect(response.status).toBe(200);
    expect(telegramClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 1001,
        text: "Sorry, I could not generate an AI reply right now. Please try again later.",
      }),
    );
    expect(conversationRepo.botReplies[0]).toMatchObject({
      route: "ai_answer",
      text: "Sorry, I could not generate an AI reply right now. Please try again later.",
    });
    expect(testLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "telegram_webhook_ai_reply_failed",
        updateId: 23,
        route: "ai_answer",
        chatId: 1001,
        errorCode: "QWEN_API_FAILED",
      }),
    );
    expect(errorLogRepo.logs[0]).toMatchObject({
      source: "qwen",
      errorCode: "QWEN_API_FAILED",
      message: "Qwen unavailable",
      updateId: 23,
      chatId: 1001,
      route: "ai_answer",
      metadata: {
        qwenStatus: 503,
        qwenErrorCode: "ServiceUnavailable",
      },
    });
  });

  it("persists callback interactions and the visible route reply", async () => {
    const telegramClient = createTelegramClient();
    const conversationRepo = createConversationRepository();

    const response = await handle(
      request({
        update_id: 21,
        callback_query: {
          id: "callback-2",
          from: {
            id: 2002,
            first_name: "Test",
          },
          message: {
            message_id: 31,
            chat: {
              id: 1001,
              type: "private",
            },
          },
          data: BOT_CALLBACK_DATA.quizMe,
        },
      }),
      telegramClient,
      createLogger(),
      {
        conversationRepository: conversationRepo,
        errorLogRepository: createErrorLogRepository(),
      },
    );

    expect(response.status).toBe(200);
    expect(conversationRepo.calls).toEqual([
      "recordCallbackInteraction",
      "recordBotReply",
    ]);
    expect(conversationRepo.callbackInteractions[0]).toMatchObject({
      route: "quiz_me",
      resetConversation: undefined,
    });
    expect(conversationRepo.botReplies[0]).toMatchObject({
      route: "quiz_me",
      text: BOT_SCRIPTED_REPLIES.quizMe,
    });
  });

  it("passes resetConversation when /newchat is routed", async () => {
    const conversationRepo = createConversationRepository();

    const response = await handle(
      request({
        update_id: 22,
        message: {
          message_id: 32,
          chat: {
            id: 1001,
          },
          text: "/newchat",
        },
      }),
      createTelegramClient(),
      createLogger(),
      {
        conversationRepository: conversationRepo,
        errorLogRepository: createErrorLogRepository(),
      },
    );

    expect(response.status).toBe(200);
    expect(conversationRepo.incomingMessages[0]).toMatchObject({
      route: "new_chat",
      resetConversation: true,
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
    const errorLogRepo = createErrorLogRepository();
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
      {
        conversationRepository: createConversationRepository(),
        errorLogRepository: errorLogRepo,
      },
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
    expect(errorLogRepo.logs[0]).toMatchObject({
      source: "telegram",
      errorCode: "TELEGRAM_API_FAILED",
      message: "Telegram failed",
      updateId: 5,
      chatId: 1001,
      route: "help",
    });
  });

  it("sends the database fallback and skips the normal route reply when persistence fails", async () => {
    const telegramClient = createTelegramClient();
    const testLogger = createLogger();
    const conversationRepo = createConversationRepository();
    const errorLogRepo = createErrorLogRepository();
    vi.mocked(conversationRepo.recordIncomingMessage).mockRejectedValueOnce(
      new DatabaseError("Database unavailable"),
    );

    const response = await handle(
      request({
        update_id: 6,
        message: {
          message_id: 16,
          chat: {
            id: 1001,
          },
          text: "/help",
        },
      }),
      telegramClient,
      testLogger,
      {
        conversationRepository: conversationRepo,
        errorLogRepository: errorLogRepo,
      },
    );

    expect(response.status).toBe(500);
    expect(telegramClient.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegramClient.sendMessage).toHaveBeenCalledWith({
      chat_id: 1001,
      text: "Sorry, I could not save the conversation right now. Please try again later.",
    });
    expect(conversationRepo.recordBotReply).not.toHaveBeenCalled();
    expect(testLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "telegram_webhook_persistence_failed",
        updateId: 6,
        route: "help",
        chatId: 1001,
        errorCode: "DATABASE_FAILED",
      }),
    );
    expect(errorLogRepo.logs[0]).toMatchObject({
      source: "database",
      errorCode: "DATABASE_FAILED",
      message: "Database unavailable",
      updateId: 6,
      chatId: 1001,
      route: "help",
    });
  });
});
