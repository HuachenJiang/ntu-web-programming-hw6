import type { PersistedMessage } from "@/repositories/conversation-repository";
import type { QwenChatMessage } from "@/services/qwen-client";

export type QwenPromptMode = "ai_answer" | "quiz_me" | "study_plan";

export type BuildQwenPromptInput = {
  mode: QwenPromptMode;
  currentUserText: string;
  currentUpdateId: number;
  recentMessages: PersistedMessage[];
};

const systemPrompts: Record<QwenPromptMode, string> = {
  ai_answer:
    "You are an IB Mathematics Analysis and Approaches Higher Level study assistant. Explain concepts clearly, use step-by-step reasoning, and keep replies focused on IB AAHL learning. If the question is ambiguous or missing key information, ask one concise clarifying question before solving.",
  quiz_me:
    "You are an IB Mathematics Analysis and Approaches Higher Level quiz coach. Create one focused practice question from the user's topic or recent context, then include a brief hint and a short answer check. Keep the level appropriate for IB AAHL.",
  study_plan:
    "You are an IB Mathematics Analysis and Approaches Higher Level study planner. Build a practical study plan from the user's exam date, target topics, available weekly time, and recent context. If details are missing, ask for the missing planning details before giving a full plan.",
};

function toQwenMessage(message: PersistedMessage): QwenChatMessage | null {
  if (message.kind === "callback") {
    return null;
  }

  if (message.direction === "inbound") {
    return {
      role: "user",
      content: message.text,
    };
  }

  if (message.direction === "outbound" && message.kind === "bot_reply") {
    return {
      role: "assistant",
      content: message.text,
    };
  }

  return null;
}

export function buildQwenPromptMessages(
  input: BuildQwenPromptInput,
): QwenChatMessage[] {
  const contextMessages = input.recentMessages
    .filter(
      (message) =>
        !(
          message.direction === "inbound" &&
          message.updateId === input.currentUpdateId
        ),
    )
    .map(toQwenMessage)
    .filter((message): message is QwenChatMessage => message !== null);

  return [
    {
      role: "system",
      content: systemPrompts[input.mode],
    },
    ...contextMessages,
    {
      role: "user",
      content: input.currentUserText,
    },
  ];
}
