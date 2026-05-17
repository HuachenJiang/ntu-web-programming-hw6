import mongoose from "mongoose";
import { loadAppConfig, type AppEnvironmentConfig } from "@/config/app";
import { DatabaseError } from "@/errors/database-error";

type MongooseConnectionCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseConnectionCache: MongooseConnectionCache | undefined;
}

const connectionCache =
  globalThis.mongooseConnectionCache ??
  (globalThis.mongooseConnectionCache = {
    connection: null,
    promise: null,
  });

export async function connectToMongoDb(
  config: AppEnvironmentConfig = loadAppConfig(),
): Promise<typeof mongoose> {
  if (connectionCache.connection) {
    return connectionCache.connection;
  }

  if (!connectionCache.promise) {
    mongoose.set("bufferCommands", false);
    connectionCache.promise = mongoose
      .connect(config.mongodb.uri)
      .catch((error: unknown) => {
        connectionCache.promise = null;
        throw new DatabaseError("Failed to connect to MongoDB", error);
      });
  }

  connectionCache.connection = await connectionCache.promise;
  return connectionCache.connection;
}
