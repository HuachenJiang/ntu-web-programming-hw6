import { type AppEnvironmentConfig } from "@/config/app";
import { DatabaseError } from "@/errors/database-error";
import { connectToMongoDb } from "@/lib/mongodb";
import { ErrorLogModel } from "@/models/error-log";

export type ErrorLogSource =
  | "telegram"
  | "qwen"
  | "database"
  | "webhook"
  | "unknown";

export type RecordErrorLogInput = {
  source: ErrorLogSource;
  errorCode: string;
  message: string;
  updateId?: number;
  chatId?: number | null;
  route?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
};

export type ErrorLogRepository = {
  recordErrorLog(input: RecordErrorLogInput): Promise<void>;
};

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

export function createErrorLogRepository(
  config?: AppEnvironmentConfig,
): ErrorLogRepository {
  async function connect(): Promise<void> {
    await connectToMongoDb(config);
  }

  return {
    async recordErrorLog(input) {
      await runDatabaseOperation(async () => {
        await connect();
        await ErrorLogModel.create({
          source: input.source,
          errorCode: input.errorCode,
          message: input.message,
          ...(input.updateId !== undefined ? { updateId: input.updateId } : {}),
          ...(input.chatId !== undefined && input.chatId !== null
            ? { chatId: input.chatId }
            : {}),
          ...(input.route ? { route: input.route } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
          createdAt: input.createdAt ?? new Date(),
        });
      });
    },
  };
}

export const errorLogRepository = createErrorLogRepository();
