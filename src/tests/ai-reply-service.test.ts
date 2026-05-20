import { describe, expect, it, vi } from "vitest";
import type { AppEnvironmentConfig } from "@/config/app";
import type {
  ConversationModeSelection,
  ConversationRepository,
  PersistedMessage,
} from "@/repositories/conversation-repository";
import { createAiReplyService } from "@/services/ai-reply-service";
import type {
  GenerateChatCompletionInput,
  QwenClient,
} from "@/services/qwen-client";

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
    recentContextMessageLimit: 2,
  },
};

function persistedMessage(
  overrides: Partial<PersistedMessage>,
): PersistedMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    telegramUserId: 2002,
    chatId: 1001,
    updateId: 1,
    direction: "inbound",
    kind: "text",
    route: "ai_answer",
    text: "Explain functions.",
    createdAt: new Date(0),
    ...overrides,
  };
}

function createConversationRepository(
  recentMessages: PersistedMessage[],
  mode: ConversationModeSelection | null,
): ConversationRepository {
  return {
    recordIncomingMessage: vi.fn(),
    recordCallbackInteraction: vi.fn(),
    recordBotReply: vi.fn(),
    findMessagesByTelegramUserId: vi.fn(),
    findMessagesByDateRange: vi.fn(),
    searchMessagesByText: vi.fn(),
    findRecentMessagesByConversationId: vi.fn(async () => recentMessages),
    findLatestModeSelectionByConversationId: vi.fn(async () => mode),
  };
}

function createQwenClient(): QwenClient & {
  requests: GenerateChatCompletionInput[];
  reply: string;
} {
  const requests: GenerateChatCompletionInput[] = [];
  const client = {
    requests,
    reply: "Generated Qwen reply",
    generateChatCompletion: vi.fn(
      async (input: GenerateChatCompletionInput) => {
        requests.push(input);
        return client.reply;
      },
    ),
  };

  return client;
}

describe("createAiReplyService", () => {
  it("loads recent context, uses the latest selected mode, and calls Qwen", async () => {
    const repository = createConversationRepository(
      [
        persistedMessage({
          updateId: 1,
          direction: "inbound",
          text: "I need quiz practice.",
        }),
        persistedMessage({
          updateId: 2,
          direction: "outbound",
          kind: "bot_reply",
          text: "Which topic?",
        }),
        persistedMessage({
          updateId: 3,
          direction: "inbound",
          text: "Calculus",
        }),
      ],
      "quiz_me",
    );
    const qwenClient = createQwenClient();
    const service = createAiReplyService({
      config,
      conversationRepository: repository,
      qwenClient,
    });

    await expect(
      service.generateReply({
        context: {
          conversationId: "conversation-1",
          telegramUserId: 2002,
          chatId: 1001,
        },
        currentUserText: "Calculus",
        currentUpdateId: 3,
      }),
    ).resolves.toBe("Generated Qwen reply");

    expect(repository.findRecentMessagesByConversationId).toHaveBeenCalledWith(
      "conversation-1",
      3,
    );
    expect(
      repository.findLatestModeSelectionByConversationId,
    ).toHaveBeenCalledWith("conversation-1");
    expect(qwenClient.requests[0]).toMatchObject({
      model: "qwen-plus",
      messages: [
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("quiz coach"),
        }),
        {
          role: "user",
          content: "I need quiz practice.",
        },
        {
          role: "assistant",
          content: "Which topic?",
        },
        {
          role: "user",
          content: "Calculus",
        },
      ],
    });
  });

  it("defaults to Ask AI when no mode callback exists", async () => {
    const repository = createConversationRepository([], null);
    const qwenClient = createQwenClient();
    const service = createAiReplyService({
      config,
      conversationRepository: repository,
      qwenClient,
    });

    await service.generateReply({
      context: {
        conversationId: "conversation-1",
        telegramUserId: 2002,
        chatId: 1001,
      },
      currentUserText: "What is a derivative?",
      currentUpdateId: 4,
    });

    expect(qwenClient.requests[0]?.messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("study assistant"),
    });
  });

  it("normalizes generated replies before returning them", async () => {
    const repository = createConversationRepository([], null);
    const qwenClient = createQwenClient();
    qwenClient.reply = String.raw`### Answer

**Key idea:** $\log_2 3 = \frac{p}{q}$ and p \in \mathbb{Z}^+.`;
    const service = createAiReplyService({
      config,
      conversationRepository: repository,
      qwenClient,
    });

    await expect(
      service.generateReply({
        context: {
          conversationId: "conversation-1",
          telegramUserId: 2002,
          chatId: 1001,
        },
        currentUserText: "Proof by contradiction",
        currentUpdateId: 5,
      }),
    ).resolves.toBe("Answer\n\nKey idea: log_2 3 = (p)/(q) and p in Z+.");
  });
});
