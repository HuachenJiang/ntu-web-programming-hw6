import { describe, expect, it } from "vitest";
import type { PersistedMessage } from "@/repositories/conversation-repository";
import { buildQwenPromptMessages } from "@/services/qwen-prompts";

function message(overrides: Partial<PersistedMessage>): PersistedMessage {
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

describe("buildQwenPromptMessages", () => {
  it("maps recent conversation context and excludes callbacks plus the current inbound message", () => {
    const messages = buildQwenPromptMessages({
      mode: "quiz_me",
      currentUserText: "Calculus",
      currentUpdateId: 3,
      recentMessages: [
        message({
          updateId: 1,
          direction: "inbound",
          kind: "text",
          text: "I need practice.",
        }),
        message({
          updateId: 2,
          direction: "outbound",
          kind: "bot_reply",
          text: "Which topic?",
        }),
        message({
          updateId: 2,
          direction: "inbound",
          kind: "callback",
          text: "menu:quiz_me",
        }),
        message({
          updateId: 3,
          direction: "inbound",
          kind: "text",
          text: "Calculus",
        }),
      ],
    });

    expect(messages).toEqual([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("quiz coach"),
      }),
      {
        role: "user",
        content: "I need practice.",
      },
      {
        role: "assistant",
        content: "Which topic?",
      },
      {
        role: "user",
        content: "Calculus",
      },
    ]);
  });

  it("uses the study planning system prompt for study_plan mode", () => {
    const messages = buildQwenPromptMessages({
      mode: "study_plan",
      currentUserText: "Exam in 6 weeks.",
      currentUpdateId: 1,
      recentMessages: [],
    });

    expect(messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("study planner"),
    });
  });

  it("instructs Qwen to write plain Telegram text without Markdown or LaTeX delimiters", () => {
    const messages = buildQwenPromptMessages({
      mode: "ai_answer",
      currentUserText: "Explain proof by contradiction.",
      currentUpdateId: 1,
      recentMessages: [],
    });

    expect(messages[0]?.content).toContain("plain Telegram text");
    expect(messages[0]?.content).toContain("no Markdown headings");
    expect(messages[0]?.content).toContain("LaTeX delimiters");
    expect(messages[0]?.content).toContain("log_2(3)");
  });
});
