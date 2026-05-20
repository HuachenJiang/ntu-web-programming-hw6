import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeId = {
  toString(): string;
};

type FakeMessage = {
  _id: FakeId;
  conversationId: FakeId;
  telegramUserId: number;
  chatId: number;
  updateId: number;
  direction: "inbound" | "outbound";
  kind: "text" | "callback" | "bot_reply";
  route: string;
  text: string;
  createdAt: Date;
};

type FakeUser = {
  _id: FakeId;
  telegramUserId: number;
  username?: string;
  firstName?: string;
  lastSeenAt: Date;
};

type FakeErrorLog = {
  source: string;
  errorCode: string;
  message: string;
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
  messages: [] as FakeMessage[],
  users: [] as FakeUser[],
  errorLogs: [] as FakeErrorLog[],
}));

vi.mock("@/lib/mongodb", () => ({
  connectToMongoDb: vi.fn(async () => true),
}));

vi.mock("@/models/message", () => ({
  MessageModel: {
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

          if (typeof filter.telegramUserId === "number") {
            results = results.filter(
              (message) => message.telegramUserId === filter.telegramUserId,
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
          }

          if (typeof limitState === "number") {
            results = results.slice(0, limitState);
          }

          return results;
        },
      };

      return chain;
    }),
    findOne: vi.fn(() => {
      const chain = {
        sort() {
          return chain;
        },
        lean() {
          return chain;
        },
        async exec() {
          return [...store.messages].sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          )[0];
        },
      };

      return chain;
    }),
    countDocuments: vi.fn(() => createExecQuery(store.messages.length)),
  },
}));

vi.mock("@/models/user", () => ({
  UserModel: {
    findOne: vi.fn(() => {
      const chain = {
        sort() {
          return chain;
        },
        lean() {
          return chain;
        },
        async exec() {
          return [...store.users].sort(
            (left, right) =>
              right.lastSeenAt.getTime() - left.lastSeenAt.getTime(),
          )[0];
        },
      };

      return chain;
    }),
    countDocuments: vi.fn(() => createExecQuery(store.users.length)),
  },
}));

vi.mock("@/models/error-log", () => ({
  ErrorLogModel: {
    countDocuments: vi.fn((filter: Record<string, unknown>) =>
      createExecQuery(
        store.errorLogs.filter((log) => log.source === filter.source).length,
      ),
    ),
  },
}));

import { createDashboardRepository } from "@/repositories/dashboard-repository";

describe("dashboard repository", () => {
  beforeEach(() => {
    store.messages.length = 0;
    store.users.length = 0;
    store.errorLogs.length = 0;
  });

  it("finds filtered messages in reverse chronological order", async () => {
    const repository = createDashboardRepository();
    store.messages.push(
      {
        _id: fakeId("message-1"),
        conversationId: fakeId("conversation-1"),
        telegramUserId: 2002,
        chatId: 1001,
        updateId: 1,
        direction: "inbound",
        kind: "text",
        route: "ai_answer",
        text: "Old derivative question",
        createdAt: new Date("2026-05-19T12:00:00.000Z"),
      },
      {
        _id: fakeId("message-2"),
        conversationId: fakeId("conversation-1"),
        telegramUserId: 2002,
        chatId: 1001,
        updateId: 2,
        direction: "outbound",
        kind: "bot_reply",
        route: "ai_answer",
        text: "Latest derivative answer",
        createdAt: new Date("2026-05-20T12:00:00.000Z"),
      },
      {
        _id: fakeId("message-3"),
        conversationId: fakeId("conversation-2"),
        telegramUserId: 3003,
        chatId: 1003,
        updateId: 3,
        direction: "inbound",
        kind: "text",
        route: "ai_answer",
        text: "Different user",
        createdAt: new Date("2026-05-20T13:00:00.000Z"),
      },
    );

    await expect(
      repository.findMessages({
        telegramUserId: 2002,
        from: new Date("2026-05-19T00:00:00.000Z"),
        to: new Date("2026-05-20T23:59:59.999Z"),
        textQuery: "derivative",
        limit: 10,
      }),
    ).resolves.toMatchObject([
      { id: "message-2", text: "Latest derivative answer" },
      { id: "message-1", text: "Old derivative question" },
    ]);
  });

  it("counts only Qwen errors and returns the latest user", async () => {
    const repository = createDashboardRepository();
    store.users.push(
      {
        _id: fakeId("user-1"),
        telegramUserId: 2002,
        username: "ada",
        lastSeenAt: new Date("2026-05-19T10:00:00.000Z"),
      },
      {
        _id: fakeId("user-2"),
        telegramUserId: 3003,
        firstName: "Grace",
        lastSeenAt: new Date("2026-05-20T10:00:00.000Z"),
      },
    );
    store.errorLogs.push(
      {
        source: "qwen",
        errorCode: "QWEN_API_FAILED",
        message: "Qwen failed",
        createdAt: new Date(),
      },
      {
        source: "telegram",
        errorCode: "TELEGRAM_API_FAILED",
        message: "Telegram failed",
        createdAt: new Date(),
      },
    );

    await expect(repository.countQwenErrors()).resolves.toBe(1);
    await expect(repository.findLatestUser()).resolves.toMatchObject({
      telegramUserId: 3003,
      firstName: "Grace",
      lastSeenAt: new Date("2026-05-20T10:00:00.000Z"),
    });
  });
});
