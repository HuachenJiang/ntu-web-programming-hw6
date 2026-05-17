import {
  model,
  models,
  Schema,
  type InferSchemaType,
  type Model,
} from "mongoose";

const errorLogSchema = new Schema(
  {
    source: {
      type: String,
      enum: ["telegram", "qwen", "database", "webhook", "unknown"],
      required: true,
      index: true,
    },
    errorCode: {
      type: String,
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    updateId: {
      type: Number,
      index: true,
    },
    chatId: {
      type: Number,
      index: true,
    },
    route: {
      type: String,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  },
);

errorLogSchema.index({ source: 1, errorCode: 1, createdAt: -1 });

export type ErrorLogDocument = InferSchemaType<typeof errorLogSchema>;

export const ErrorLogModel =
  (models.ErrorLog as Model<ErrorLogDocument> | undefined) ??
  model<ErrorLogDocument>("ErrorLog", errorLogSchema);
