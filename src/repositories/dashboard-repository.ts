import { type AppEnvironmentConfig } from "@/config/app";
import { DatabaseError } from "@/errors/database-error";
import { connectToMongoDb } from "@/lib/mongodb";
import { ErrorLogModel } from "@/models/error-log";
import { MessageModel, type MessageDocument } from "@/models/message";
import { UserModel, type UserDocument } from "@/models/user";

export type DashboardMessage = {
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

export type DashboardLatestUser = {
  telegramUserId: number;
  username?: string;
  firstName?: string;
  lastSeenAt: Date;
};

export type DashboardMessageFilters = {
  telegramUserId?: number;
  from?: Date;
  to?: Date;
  textQuery?: string;
  limit: number;
};

export type DashboardRepository = {
  findMessages(input: DashboardMessageFilters): Promise<DashboardMessage[]>;
  countMessages(): Promise<number>;
  countUsers(): Promise<number>;
  countQwenErrors(): Promise<number>;
  findLatestMessage(): Promise<DashboardMessage | null>;
  findLatestUser(): Promise<DashboardLatestUser | null>;
};

type CreatedDocument = {
  _id: {
    toString(): string;
  };
};

type MessageQueryDocument = MessageDocument &
  CreatedDocument & {
    conversationId: {
      toString(): string;
    };
  };

type UserQueryDocument = UserDocument & CreatedDocument;

function messageToDashboardMessage(
  message: MessageQueryDocument,
): DashboardMessage {
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

function userToDashboardLatestUser(
  user: UserQueryDocument,
): DashboardLatestUser {
  return {
    telegramUserId: user.telegramUserId,
    ...(user.username ? { username: user.username } : {}),
    ...(user.firstName ? { firstName: user.firstName } : {}),
    lastSeenAt: user.lastSeenAt,
  };
}

function buildMessageFilter(
  input: DashboardMessageFilters,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (typeof input.telegramUserId === "number") {
    filter.telegramUserId = input.telegramUserId;
  }

  const createdAt: Record<string, Date> = {};

  if (input.from) {
    createdAt.$gte = input.from;
  }

  if (input.to) {
    createdAt.$lte = input.to;
  }

  if (Object.keys(createdAt).length > 0) {
    filter.createdAt = createdAt;
  }

  if (input.textQuery) {
    filter.$text = { $search: input.textQuery };
  }

  return filter;
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

export function createDashboardRepository(
  config?: AppEnvironmentConfig,
): DashboardRepository {
  async function connect(): Promise<void> {
    await connectToMongoDb(config);
  }

  return {
    async findMessages(input) {
      return runDatabaseOperation(async () => {
        await connect();

        const messages = await MessageModel.find(buildMessageFilter(input))
          .sort({ createdAt: -1 })
          .limit(input.limit)
          .lean<MessageQueryDocument[]>()
          .exec();

        return messages.map(messageToDashboardMessage);
      });
    },

    async countMessages() {
      return runDatabaseOperation(async () => {
        await connect();

        return MessageModel.countDocuments({}).exec();
      });
    },

    async countUsers() {
      return runDatabaseOperation(async () => {
        await connect();

        return UserModel.countDocuments({}).exec();
      });
    },

    async countQwenErrors() {
      return runDatabaseOperation(async () => {
        await connect();

        return ErrorLogModel.countDocuments({ source: "qwen" }).exec();
      });
    },

    async findLatestMessage() {
      return runDatabaseOperation(async () => {
        await connect();

        const message = await MessageModel.findOne({})
          .sort({ createdAt: -1 })
          .lean<MessageQueryDocument | null>()
          .exec();

        return message ? messageToDashboardMessage(message) : null;
      });
    },

    async findLatestUser() {
      return runDatabaseOperation(async () => {
        await connect();

        const user = await UserModel.findOne({})
          .sort({ lastSeenAt: -1 })
          .lean<UserQueryDocument | null>()
          .exec();

        return user ? userToDashboardLatestUser(user) : null;
      });
    },
  };
}

export const dashboardRepository = createDashboardRepository();
