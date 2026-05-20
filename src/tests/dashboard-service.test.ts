import { describe, expect, it, vi } from "vitest";
import {
  DashboardQueryError,
  getDashboardData,
  parseDashboardSearchParams,
  serializeDashboardData,
} from "@/services/dashboard-service";
import type {
  DashboardLatestUser,
  DashboardMessage,
  DashboardRepository,
} from "@/repositories/dashboard-repository";

const latestMessage: DashboardMessage = {
  id: "message-2",
  conversationId: "conversation-1",
  telegramUserId: 2002,
  chatId: 1001,
  updateId: 2,
  direction: "outbound",
  kind: "bot_reply",
  route: "ai_answer",
  text: "Use the power rule.",
  createdAt: new Date("2026-05-20T10:30:00.000Z"),
};

const latestUser: DashboardLatestUser = {
  telegramUserId: 2002,
  username: "ada",
  firstName: "Ada",
  lastSeenAt: new Date("2026-05-20T10:25:00.000Z"),
};

function createRepository(
  messages: DashboardMessage[] = [latestMessage],
): DashboardRepository & {
  findMessages: ReturnType<typeof vi.fn<DashboardRepository["findMessages"]>>;
} {
  return {
    findMessages: vi.fn(async () => messages),
    countMessages: vi.fn(async () => messages.length),
    countUsers: vi.fn(async () => (messages.length > 0 ? 1 : 0)),
    countQwenErrors: vi.fn(async () => 3),
    findLatestMessage: vi.fn(async () => messages[0] ?? null),
    findLatestUser: vi.fn(async () =>
      messages.length > 0 ? latestUser : null,
    ),
  };
}

describe("dashboard service", () => {
  it("returns stats, filters, and recent messages for the default query", async () => {
    const repository = createRepository();

    await expect(
      getDashboardData(new URLSearchParams(), { repository }),
    ).resolves.toEqual({
      stats: {
        totalMessages: 1,
        totalUsers: 1,
        qwenErrorCount: 3,
        latestMessageAt: "2026-05-20T10:30:00.000Z",
        latestUser,
      },
      messages: [latestMessage],
      filters: {
        userId: "",
        from: "",
        to: "",
        q: "",
        limit: 50,
      },
    });
    expect(repository.findMessages).toHaveBeenCalledWith({ limit: 50 });
  });

  it("combines user, date, text, and limit filters", async () => {
    const repository = createRepository();

    await getDashboardData(
      new URLSearchParams({
        userId: "2002",
        from: "2026-05-19",
        to: "2026-05-20",
        q: "derivative",
        limit: "20",
      }),
      { repository },
    );

    expect(repository.findMessages).toHaveBeenCalledWith({
      telegramUserId: 2002,
      from: new Date("2026-05-19T00:00:00.000Z"),
      to: new Date("2026-05-20T23:59:59.999Z"),
      textQuery: "derivative",
      limit: 20,
    });
  });

  it("returns null latest fields when there is no data", async () => {
    const repository = createRepository([]);

    await expect(
      getDashboardData(new URLSearchParams(), { repository }),
    ).resolves.toMatchObject({
      stats: {
        totalMessages: 0,
        totalUsers: 0,
        latestMessageAt: null,
        latestUser: null,
      },
      messages: [],
    });
  });

  it("serializes dashboard dates for API and client data", async () => {
    const data = await getDashboardData(new URLSearchParams(), {
      repository: createRepository(),
    });

    expect(serializeDashboardData(data)).toMatchObject({
      stats: {
        latestMessageAt: "2026-05-20T10:30:00.000Z",
        latestUser: {
          telegramUserId: 2002,
          lastSeenAt: "2026-05-20T10:25:00.000Z",
        },
      },
      messages: [
        {
          id: "message-2",
          createdAt: "2026-05-20T10:30:00.000Z",
        },
      ],
    });
  });

  it("rejects invalid user id, date, and limit values", () => {
    expect(() =>
      parseDashboardSearchParams(new URLSearchParams({ userId: "abc" })),
    ).toThrow(DashboardQueryError);
    expect(() =>
      parseDashboardSearchParams(new URLSearchParams({ from: "2026-02-31" })),
    ).toThrow(DashboardQueryError);
    expect(() =>
      parseDashboardSearchParams(new URLSearchParams({ limit: "101" })),
    ).toThrow(DashboardQueryError);
  });
});
