import {
  model,
  models,
  Schema,
  type InferSchemaType,
  type Model,
} from "mongoose";

const userSchema = new Schema(
  {
    telegramUserId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      trim: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    isBot: {
      type: Boolean,
    },
    lastSeenAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const UserModel =
  (models.User as Model<UserDocument> | undefined) ??
  model<UserDocument>("User", userSchema);
