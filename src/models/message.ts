import {
  model,
  models,
  Schema,
  type InferSchemaType,
  type Model,
} from "mongoose";

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
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
    updateId: {
      type: Number,
      required: true,
      index: true,
    },
    telegramMessageId: {
      type: Number,
    },
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["text", "callback", "bot_reply"],
      required: true,
      index: true,
    },
    route: {
      type: String,
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      default: "",
    },
    callbackQueryId: {
      type: String,
      index: true,
    },
    callbackData: {
      type: String,
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

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ telegramUserId: 1, createdAt: 1 });
messageSchema.index({ createdAt: 1 });
messageSchema.index({ text: "text" });

export type MessageDocument = InferSchemaType<typeof messageSchema>;

export const MessageModel =
  (models.Message as Model<MessageDocument> | undefined) ??
  model<MessageDocument>("Message", messageSchema);
