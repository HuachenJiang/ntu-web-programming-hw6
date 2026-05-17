import {
  model,
  models,
  Schema,
  type InferSchemaType,
  type Model,
} from "mongoose";

const conversationSchema = new Schema(
  {
    telegramUserId: {
      type: Number,
      required: true,
      index: true,
    },
    chatId: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      required: true,
      default: "active",
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastMessageAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

conversationSchema.index({ telegramUserId: 1, chatId: 1, status: 1 });
conversationSchema.index({ lastMessageAt: -1 });

export type ConversationDocument = InferSchemaType<typeof conversationSchema>;

export const ConversationModel =
  (models.Conversation as Model<ConversationDocument> | undefined) ??
  model<ConversationDocument>("Conversation", conversationSchema);
