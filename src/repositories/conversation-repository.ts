import { type AppEnvironmentConfig } from "@/config/app";
import { DatabaseError } from "@/errors/database-error";
import { connectToMongoDb } from "@/lib/mongodb";
import {
  ConversationModel,
  type ConversationDocument,
} from "@/models/conversation";
import { MessageModel, type MessageDocument } from "@/models/message";
import { UserModel } from "@/models/user";
import type { BotRoute } from "@/types/bot";
import type {
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from "@/types/telegram";

export type PersistedMessage = {
  id: string;
  conversationId: string;
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

export type PersistedConversationContext = {
  conversationId: string | null;
  telegramUserId: number | null;
  chatId: number | null;
};

export type RecordIncomingMessageInput = {
  update: TelegramUpdate;
  route: BotRoute;
  resetConversation?: boolean;
};

export type RecordCallbackInteractionInput = {
  update: TelegramUpdate;
  route: BotRoute;
  resetConversation?: boolean;
};

export type RecordBotReplyInput = PersistedConversationContext & {
  updateId: number;
  route: BotRoute;
  text: string;
};

export type FindMessagesByDateRangeInput = {
  from?: Date;
  to?: Date;
};

export type ConversationModeSelection = Extract<
  BotRoute,
  "ai_answer" | "quiz_me" | "study_plan"
>;

export type ConversationRepository = {
  recordIncomingMessage(
    input: RecordIncomingMessageInput,
  ): Promise<PersistedConversationContext>;
  recordCallbackInteraction(
    input: RecordCallbackInteractionInput,
  ): Promise<PersistedConversationContext>;
  recordBotReply(input: RecordBotReplyInput): Promise<void>;
  findMessagesByTelegramUserId(
    telegramUserId: number,
  ): Promise<PersistedMessage[]>;
  findMessagesByDateRange(
    input: FindMessagesByDateRangeInput,
  ): Promise<PersistedMessage[]>;
  searchMessagesByText(query: string): Promise<PersistedMessage[]>;
  findRecentMessagesByConversationId(
    conversationId: string,
    limit: number,
  ): Promise<PersistedMessage[]>;
  findLatestModeSelectionByConversationId(
    conversationId: string,
  ): Promise<ConversationModeSelection | null>;
};

type CreatedDocument = {
  _id: {
    toString(): string;
  };
};

type QueryResultDocument = MessageDocument & CreatedDocument;

const emptyConversationContext: PersistedConversationContext = {
  conversationId: null,
  telegramUserId: null,
  chatId: null,
};

const modeSelectionRoutes = new Set<ConversationModeSelection>([
  "ai_answer",
  "quiz_me",
  "study_plan",
]);

function getTelegramDate(timestamp?: number): Date {
  return typeof timestamp === "number"
    ? new Date(timestamp * 1000)
    : new Date();
}

function getMessageTelegramUserId(message: TelegramMessage): number {
  return message.from?.id ?? message.chat.id;
}

function messageToPersistedMessage(
  message: QueryResultDocument,
): PersistedMessage {
  return {
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    telegramUserId: message.telegramUserId,
    chatId: message.chatId,
    updateId: message.updateId,
    ...(typeof message.telegramMessageId === "number"
      ? { telegramMessageId: message.telegramMessageId }
      : {}),
    direction: message.direction,
    kind: message.kind,
    route: message.route,
    text: message.text,
    ...(message.callbackQueryId
      ? { callbackQueryId: message.callbackQueryId }
      : {}),
    ...(message.callbackData ? { callbackData: message.callbackData } : {}),
    createdAt: message.createdAt,
  };
}

function shouldUpsertUser(
  user: TelegramUser | undefined,
): user is TelegramUser {
  return typeof user?.id === "number";
}

async function upsertTelegramUser(
  user: TelegramUser | undefined,
  lastSeenAt: Date,
): Promise<void> {
  if (!shouldUpsertUser(user)) {
    return;
  }

  await UserModel.updateOne(
    { telegramUserId: user.id },
    {
      $set: {
        ...(user.username ? { username: user.username } : {}),
        ...(user.first_name ? { firstName: user.first_name } : {}),
        ...(typeof user.is_bot === "boolean" ? { isBot: user.is_bot } : {}),
        lastSeenAt,
      },
      $setOnInsert: {
        telegramUserId: user.id,
      },
    },
    { upsert: true },
  ).exec();
}

async function resolveConversation(
  telegramUserId: number,
  chatId: number,
  at: Date,
  resetConversation: boolean,
): Promise<CreatedDocument> {
  if (resetConversation) {
    await ConversationModel.updateMany(
      { telegramUserId, chatId, status: "active" },
      { $set: { status: "closed", lastMessageAt: at } },
    ).exec();
  } else {
    const activeConversation = await ConversationModel.findOneAndUpdate(
      { telegramUserId, chatId, status: "active" },
      { $set: { lastMessageAt: at } },
      { new: true, sort: { lastMessageAt: -1 } },
    ).exec();

    if (activeConversation) {
      return activeConversation as ConversationDocument & CreatedDocument;
    }
  }

  return (await ConversationModel.create({
    telegramUserId,
    chatId,
    status: "active",
    startedAt: at,
    lastMessageAt: at,
  })) as ConversationDocument & CreatedDocument;
}

async function recordMessage(
  input: Omit<PersistedMessage, "id" | "conversationId"> & {
    conversationId: string;
  },
): Promise<void> {
  await MessageModel.create(input);
  await ConversationModel.updateOne(
    { _id: input.conversationId },
    { $set: { lastMessageAt: input.createdAt } },
  ).exec();
}

async function runDatabaseOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }

    throw new DatabaseError("Database operation failed", error);
  }
}

export function createConversationRepository(
  config?: AppEnvironmentConfig,
): ConversationRepository {
  async function connect(): Promise<void> {
    await connectToMongoDb(config);
  }

  return {
    async recordIncomingMessage(input) {
      return runDatabaseOperation(async () => {
        await connect();

        const message = input.update.message;

        if (!message) {
          return emptyConversationContext;
        }

        const createdAt = getTelegramDate(message.date);
        const telegramUserId = getMessageTelegramUserId(message);
        const chatId = message.chat.id;

        await upsertTelegramUser(message.from, createdAt);

        const conversation = await resolveConversation(
          telegramUserId,
          chatId,
          createdAt,
          input.resetConversation ?? false,
        );
        const conversationId = conversation._id.toString();

        await recordMessage({
          conversationId,
          telegramUserId,
          chatId,
          updateId: input.update.update_id,
          telegramMessageId: message.message_id,
          direction: "inbound",
          kind: "text",
          route: input.route,
          text: message.text ?? "",
          createdAt,
        });

        return {
          conversationId,
          telegramUserId,
          chatId,
        };
      });
    },

    async recordCallbackInteraction(input) {
      return runDatabaseOperation(async () => {
        await connect();

        const callbackQuery: TelegramCallbackQuery | undefined =
          input.update.callback_query;
        const chatId = callbackQuery?.message?.chat.id;

        if (!callbackQuery || typeof chatId !== "number") {
          return emptyConversationContext;
        }

        const createdAt = new Date();
        const telegramUserId = callbackQuery.from.id;

        await upsertTelegramUser(callbackQuery.from, createdAt);

        const conversation = await resolveConversation(
          telegramUserId,
          chatId,
          createdAt,
          input.resetConversation ?? false,
        );
        const conversationId = conversation._id.toString();

        await recordMessage({
          conversationId,
          telegramUserId,
          chatId,
          updateId: input.update.update_id,
          telegramMessageId: callbackQuery.message?.message_id,
          direction: "inbound",
          kind: "callback",
          route: input.route,
          text: callbackQuery.data ?? "",
          callbackQueryId: callbackQuery.id,
          callbackData: callbackQuery.data,
          createdAt,
        });

        return {
          conversationId,
          telegramUserId,
          chatId,
        };
      });
    },

    async recordBotReply(input) {
      await runDatabaseOperation(async () => {
        await connect();

        if (
          input.conversationId === null ||
          input.telegramUserId === null ||
          input.chatId === null
        ) {
          return;
        }

        await recordMessage({
          conversationId: input.conversationId,
          telegramUserId: input.telegramUserId,
          chatId: input.chatId,
          updateId: input.updateId,
          direction: "outbound",
          kind: "bot_reply",
          route: input.route,
          text: input.text,
          createdAt: new Date(),
        });
      });
    },

    async findMessagesByTelegramUserId(telegramUserId) {
      return runDatabaseOperation(async () => {
        await connect();
        const messages = await MessageModel.find({ telegramUserId })
          .sort({ createdAt: 1 })
          .lean<QueryResultDocument[]>()
          .exec();

        return messages.map(messageToPersistedMessage);
      });
    },

    async findMessagesByDateRange(input) {
      return runDatabaseOperation(async () => {
        await connect();
        const createdAt: Record<string, Date> = {};

        if (input.from) {
          createdAt.$gte = input.from;
        }

        if (input.to) {
          createdAt.$lte = input.to;
        }

        const messages = await MessageModel.find(
          Object.keys(createdAt).length > 0 ? { createdAt } : {},
        )
          .sort({ createdAt: 1 })
          .lean<QueryResultDocument[]>()
          .exec();

        return messages.map(messageToPersistedMessage);
      });
    },

    async searchMessagesByText(query) {
      return runDatabaseOperation(async () => {
        await connect();
        const searchQuery = query.trim();

        if (!searchQuery) {
          return [];
        }

        const messages = await MessageModel.find({
          $text: { $search: searchQuery },
        })
          .sort({ createdAt: -1 })
          .lean<QueryResultDocument[]>()
          .exec();

        return messages.map(messageToPersistedMessage);
      });
    },

    async findRecentMessagesByConversationId(conversationId, limit) {
      return runDatabaseOperation(async () => {
        await connect();

        if (limit <= 0) {
          return [];
        }

        const messages = await MessageModel.find({ conversationId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean<QueryResultDocument[]>()
          .exec();

        return messages.reverse().map(messageToPersistedMessage);
      });
    },

    async findLatestModeSelectionByConversationId(conversationId) {
      return runDatabaseOperation(async () => {
        await connect();

        const messages = await MessageModel.find({
          conversationId,
          kind: "callback",
          route: {
            $in: [...modeSelectionRoutes],
          },
        })
          .sort({ createdAt: -1 })
          .limit(1)
          .lean<QueryResultDocument[]>()
          .exec();
        const route = messages[0]?.route;

        return modeSelectionRoutes.has(route as ConversationModeSelection)
          ? (route as ConversationModeSelection)
          : null;
      });
    },
  };
}

export const conversationRepository = createConversationRepository();
