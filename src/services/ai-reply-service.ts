import { loadAppConfig, type AppEnvironmentConfig } from "@/config/app";
import {
  conversationRepository,
  type ConversationRepository,
  type PersistedConversationContext,
} from "@/repositories/conversation-repository";
import { createQwenClient, type QwenClient } from "@/services/qwen-client";
import {
  buildQwenPromptMessages,
  type QwenPromptMode,
} from "@/services/qwen-prompts";

export type GenerateAiReplyInput = {
  context: PersistedConversationContext;
  currentUserText: string;
  currentUpdateId: number;
};

export type AiReplyService = {
  generateReply(input: GenerateAiReplyInput): Promise<string>;
};

type AiReplyServiceOptions = {
  config?: AppEnvironmentConfig;
  conversationRepository?: ConversationRepository;
  qwenClient?: QwenClient;
};

function resolvePromptMode(mode: QwenPromptMode | null): QwenPromptMode {
  return mode ?? "ai_answer";
}

export function createAiReplyService(
  options: AiReplyServiceOptions = {},
): AiReplyService {
  const config = options.config ?? loadAppConfig();
  const activeConversationRepository =
    options.conversationRepository ?? conversationRepository;
  const activeQwenClient = options.qwenClient ?? createQwenClient({ config });

  return {
    async generateReply(input) {
      if (input.context.conversationId === null) {
        return activeQwenClient.generateChatCompletion({
          model: config.qwen.model,
          messages: buildQwenPromptMessages({
            mode: "ai_answer",
            currentUserText: input.currentUserText,
            currentUpdateId: input.currentUpdateId,
            recentMessages: [],
          }),
        });
      }

      const [recentMessages, latestModeSelection] = await Promise.all([
        activeConversationRepository.findRecentMessagesByConversationId(
          input.context.conversationId,
          config.conversation.recentContextMessageLimit + 1,
        ),
        activeConversationRepository.findLatestModeSelectionByConversationId(
          input.context.conversationId,
        ),
      ]);

      return activeQwenClient.generateChatCompletion({
        model: config.qwen.model,
        messages: buildQwenPromptMessages({
          mode: resolvePromptMode(latestModeSelection),
          currentUserText: input.currentUserText,
          currentUpdateId: input.currentUpdateId,
          recentMessages,
        }),
      });
    },
  };
}
