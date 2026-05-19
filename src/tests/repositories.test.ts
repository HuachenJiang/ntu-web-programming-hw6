import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeId = {
  toString(): string;
};

type FakeConversation = {
  _id: FakeId;
  telegramUserId: number;
  chatId: number;
  status: "active" | "closed";
  startedAt: Date;
  lastMessageAt: Date;
};

type FakeMessage = {
  _id: FakeId;
  conversationId: FakeId;
  telegramUserId: number;
  chatId: number;
  updateId: number;
  telegramMessageId?: number;
  direction: "inbound" | "outbound";
  kind: "text" | "callback" | "bot_reply";
  route: string;
  text: string;
  callbackQueryId?: string;
  callbackData?: string;
  createdAt: Date;
};

type FakeErrorLog = {
  source: string;
  errorCode: string;
  message: string;
  updateId?: number;
  chatId?: number;
  route?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

type SortValue = Record<string, 1 | -1>;

function fakeId(id: string): FakeId {
  return {
    toString() {
      return id;
    },
  };
}

function createExecQuery<T>(value: T): {
  exec(): Promise<T>;
} {
  return {
    async exec() {
      return value;
    },
  };
}

const store = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  conversations: [] as FakeConversation[],
  messages: [] as FakeMessage[],
  errorLogs: [] as FakeErrorLog[],
}));

vi.mock("@/lib/mongodb", () => ({
  connectToMongoDb: vi.fn(async () => true),
}));

vi.mock("@/models/user", () => ({
  UserModel: {
    updateOne: vi.fn(
      (
        filter: { telegramUserId: number },
        update: { $set?: Record<string, unknown> },
      ) => {
        const existing = store.users.find(
          (user) => user.telegramUserId === filter.telegramUserId,
        );

        if (existing) {
          Object.assign(existing, update.$set);
        } else {
          store.users.push({
            telegramUserId: filter.telegramUserId,
            ...update.$set,
          });
        }

        return createExecQuery({ acknowledged: true });
      },
    ),
  },
}));

vi.mock("@/models/conversation", () => ({
  ConversationModel: {
    updateMany: vi.fn(
      (
        filter: { telegramUserId: number; chatId: number; status: string },
        update: { $set: Partial<FakeConversation> },
      ) => {
        for (const conversation of store.conversations) {
          if (
            conversation.telegramUserId === filter.telegramUserId &&
            conversation.chatId === filter.chatId &&
            conversation.status === filter.status
          ) {
            Object.assign(conversation, update.$set);
          }
        }

        return createExecQuery({ acknowledged: true });
      },
    ),
    findOneAndUpdate: vi.fn(
      (
        filter: { telegramUserId: number; chatId: number; status: string },
        update: { $set: Partial<FakeConversation> },
      ) => {
        const activeConversation =
          store.conversations.find(
            (conversation) =>
              conversation.telegramUserId === filter.telegramUserId &&
              conversation.chatId === filter.chatId &&
              conversation.status === filter.status,
          ) ?? null;

        if (activeConversation) {
          Object.assign(activeConversation, update.$set);
        }

        return createExecQuery(activeConversation);
      },
    ),
    create: vi.fn(async (input: Omit<FakeConversation, "_id">) => {
      const conversation: FakeConversation = {
        _id: fakeId(`conversation-${store.conversations.length + 1}`),
        ...input,
      };
      store.conversations.push(conversation);
      return conversation;
    }),
    updateOne: vi.fn(
      (
        filter: { _id: string },
        update: { $set: Partial<FakeConversation> },
      ) => {
        const conversation = store.conversations.find(
          (entry) => entry._id.toString() === filter._id,
        );

        if (conversation) {
          Object.assign(conversation, update.$set);
        }

        return createExecQuery({ acknowledged: true });
      },
    ),
  },
}));

vi.mock("@/models/message", () => ({
  MessageModel: {
    create: vi.fn(
      async (
        input: Omit<FakeMessage, "_id" | "conversationId"> & {
          conversationId: FakeId | string;
        },
      ) => {
        const message: FakeMessage = {
          _id: fakeId(`message-${store.messages.length + 1}`),
          ...input,
          conversationId:
            typeof input.conversationId === "string"
              ? fakeId(input.conversationId)
              : input.conversationId,
        };
        store.messages.push(message);
        return message;
      },
    ),
    find: vi.fn((filter: Record<string, unknown>) => {
      const sortState: SortValue = {};
      let limitState: number | null = null;
      const chain = {
        sort(sort: SortValue) {
          Object.assign(sortState, sort);
          return chain;
        },
        limit(limit: number) {
          limitState = limit;
          return chain;
        },
        lean() {
          return chain;
        },
        async exec() {
          let results = [...store.messages];

          if (typeof filter.conversationId === "string") {
            results = results.filter(
              (message) =>
                message.conversationId.toString() === filter.conversationId,
            );
          }

          if (typeof filter.telegramUserId === "number") {
            results = results.filter(
              (message) => message.telegramUserId === filter.telegramUserId,
            );
          }

          if (typeof filter.kind === "string") {
            results = results.filter((message) => message.kind === filter.kind);
          }

          const routeFilter = filter.route as
            | { $in?: string[] }
            | string
            | undefined;

          if (typeof routeFilter === "string") {
            results = results.filter(
              (message) => message.route === routeFilter,
            );
          } else if (routeFilter?.$in) {
            results = results.filter((message) =>
              routeFilter.$in?.includes(message.route),
            );
          }

          const createdAt = filter.createdAt as
            | { $gte?: Date; $lte?: Date }
            | undefined;

          if (createdAt?.$gte) {
            results = results.filter(
              (message) => message.createdAt >= createdAt.$gte!,
            );
          }

          if (createdAt?.$lte) {
            results = results.filter(
              (message) => message.createdAt <= createdAt.$lte!,
            );
          }

          const textSearch = filter.$text as { $search?: string } | undefined;

          if (textSearch?.$search) {
            results = results.filter((message) =>
              message.text.includes(textSearch.$search ?? ""),
            );
          }

          if (sortState.createdAt === -1) {
            results.sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime(),
            );
          } else {
            results.sort(
              (left, right) =>
                left.createdAt.getTime() - right.createdAt.getTime(),
            );
          }

          if (typeof limitState === "number") {
            results = results.slice(0, limitState);
          }

          return results;
        },
      };

      return chain;
    }),
  },
}));

vi.mock("@/models/error-log", () => ({
  ErrorLogModel: {
    create: vi.fn(async (input: FakeErrorLog) => {
      store.errorLogs.push(input);
      return input;
    }),
  },
}));

import { createConversationRepository } from "@/repositories/conversation-repository";
import { createErrorLogRepository } from "@/repositories/error-log-repository";

describe("repositories", () => {
  beforeEach(() => {
    store.users.length = 0;
    store.conversations.length = 0;
    store.messages.length = 0;
    store.errorLogs.length = 0;
  });

  it("upserts users, creates an active conversation, and stores inbound messages", async () => {
    const repository = createConversationRepository();

    const context = await repository.recordIncomingMessage({
      update: {
        update_id: 1,
        message: {
          message_id: 10,
          chat: { id: 1001 },
          from: {
            id: 2002,
            first_name: "Ada",
            username: "ada",
            is_bot: false,
          },
          date: 1710000000,
          text: "Explain vectors.",
        },
      },
      route: "ai_answer",
    });

    expect(context).toEqual({
      conversationId: "conversation-1",
      telegramUserId: 2002,
      chatId: 1001,
    });
    expect(store.users[0]).toMatchObject({
      telegramUserId: 2002,
      username: "ada",
      firstName: "Ada",
      isBot: false,
    });
    expect(store.conversations[0]).toMatchObject({
      telegramUserId: 2002,
      chatId: 1001,
      status: "active",
    });
    expect(store.messages[0]?.conversationId.toString()).toBe("conversation-1");
    expect(store.messages[0]).toMatchObject({
      telegramUserId: 2002,
      chatId: 1001,
      updateId: 1,
      telegramMessageId: 10,
      direction: "inbound",
      kind: "text",
      route: "ai_answer",
      text: "Explain vectors.",
    });
  });

  it("closes the previous active conversation when resetConversation is true", async () => {
    const repository = createConversationRepository();

    await repository.recordIncomingMessage({
      update: {
        update_id: 1,
        message: {
          message_id: 10,
          chat: { id: 1001 },
          from: { id: 2002 },
          text: "Old context",
        },
      },
      route: "ai_answer",
    });
    const context = await repository.recordIncomingMessage({
      update: {
        update_id: 2,
        message: {
          message_id: 11,
          chat: { id: 1001 },
          from: { id: 2002 },
          text: "/newchat",
        },
      },
      route: "new_chat",
      resetConversation: true,
    });

    expect(context.conversationId).toBe("conversation-2");
    expect(
      store.conversations.map((conversation) => conversation.status),
    ).toEqual(["closed", "active"]);
  });

  it("stores bot replies and supports message queries", async () => {
    const repository = createConversationRepository();
    const context = await repository.recordIncomingMessage({
      update: {
        update_id: 1,
        message: {
          message_id: 10,
          chat: { id: 1001 },
          from: { id: 2002 },
          text: "Find derivative",
        },
      },
      route: "ai_answer",
    });

    await repository.recordBotReply({
      ...context,
      updateId: 1,
      route: "ai_answer",
      text: "Use the power rule.",
    });

    await repository.recordIncomingMessage({
      update: {
        update_id: 2,
        message: {
          message_id: 11,
          chat: { id: 1003 },
          from: { id: 3004 },
          text: "Different user",
        },
      },
      route: "ai_answer",
    });

    await expect(
      repository.findMessagesByTelegramUserId(2002),
    ).resolves.toHaveLength(2);
    await expect(
      repository.findMessagesByDateRange({
        from: new Date(0),
        to: new Date(Date.now() + 1000),
      }),
    ).resolves.toHaveLength(3);
    await expect(
      repository.searchMessagesByText("power"),
    ).resolves.toMatchObject([
      {
        text: "Use the power rule.",
        direction: "outbound",
        kind: "bot_reply",
      },
    ]);
  });

  it("stores callback interactions and error logs", async () => {
    const conversationRepo = createConversationRepository();
    const errorLogRepo = createErrorLogRepository();

    await conversationRepo.recordCallbackInteraction({
      update: {
        update_id: 3,
        callback_query: {
          id: "callback-1",
          from: { id: 2002, first_name: "Ada" },
          message: {
            message_id: 12,
            chat: { id: 1001 },
          },
          data: "menu:quiz_me",
        },
      },
      route: "quiz_me",
    });
    await errorLogRepo.recordErrorLog({
      source: "telegram",
      errorCode: "TELEGRAM_API_FAILED",
      message: "Telegram failed",
      updateId: 3,
      chatId: 1001,
      route: "quiz_me",
      metadata: {
        telegramStatus: 500,
      },
    });

    expect(store.messages[0]).toMatchObject({
      kind: "callback",
      callbackQueryId: "callback-1",
      callbackData: "menu:quiz_me",
      route: "quiz_me",
    });
    expect(store.errorLogs[0]).toMatchObject({
      source: "telegram",
      errorCode: "TELEGRAM_API_FAILED",
      message: "Telegram failed",
      updateId: 3,
      chatId: 1001,
      route: "quiz_me",
      metadata: {
        telegramStatus: 500,
      },
    });
  });

  it("finds recent messages inside the current conversation only", async () => {
    const repository = createConversationRepository();
    const firstContext = await repository.recordIncomingMessage({
      update: {
        update_id: 1,
        message: {
          message_id: 10,
          chat: { id: 1001 },
          from: { id: 2002 },
          date: 1710000000,
          text: "Old conversation",
        },
      },
      route: "ai_answer",
    });

    await repository.recordIncomingMessage({
      update: {
        update_id: 2,
        message: {
          message_id: 11,
          chat: { id: 1001 },
          from: { id: 2002 },
          date: 1710000010,
          text: "/newchat",
        },
      },
      route: "new_chat",
      resetConversation: true,
    });
    await repository.recordIncomingMessage({
      update: {
        update_id: 3,
        message: {
          message_id: 12,
          chat: { id: 1001 },
          from: { id: 2002 },
          date: 1710000020,
          text: "Fresh question",
        },
      },
      route: "ai_answer",
    });

    await expect(
      repository.findRecentMessagesByConversationId(
        firstContext.conversationId ?? "",
        10,
      ),
    ).resolves.toMatchObject([{ text: "Old conversation" }]);
    await expect(
      repository.findRecentMessagesByConversationId("conversation-2", 10),
    ).resolves.toMatchObject([
      { text: "/newchat" },
      { text: "Fresh question" },
    ]);
  });

  it("finds the latest selected AI prompt mode from callbacks", async () => {
    const repository = createConversationRepository();

    const context = await repository.recordCallbackInteraction({
      update: {
        update_id: 1,
        callback_query: {
          id: "callback-1",
          from: { id: 2002 },
          message: {
            message_id: 10,
            chat: { id: 1001 },
          },
          data: "menu:quiz_me",
        },
      },
      route: "quiz_me",
    });
    await repository.recordCallbackInteraction({
      update: {
        update_id: 2,
        callback_query: {
          id: "callback-2",
          from: { id: 2002 },
          message: {
            message_id: 11,
            chat: { id: 1001 },
          },
          data: "menu:study_plan",
        },
      },
      route: "study_plan",
    });
    store.messages[0]!.createdAt = new Date(1710000000000);
    store.messages[1]!.createdAt = new Date(1710000010000);

    await expect(
      repository.findLatestModeSelectionByConversationId(
        context.conversationId ?? "",
      ),
    ).resolves.toBe("study_plan");
  });
});
