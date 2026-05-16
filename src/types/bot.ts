import type { TelegramInlineKeyboardMarkup } from "@/types/telegram";

export type BotRoute =
  | "start"
  | "help"
  | "new_chat"
  | "ai_answer"
  | "quiz_me"
  | "study_plan"
  | "unsupported"
  | "unknown_callback";

export type BotRouteEffects = {
  resetConversation?: boolean;
};

export type BotCallbackAnswer = {
  callbackQueryId: string;
  text: string;
  showAlert?: boolean;
};

export type BotAiInput = {
  text: string;
};

export type BotRouteResult = {
  chatId: number | null;
  route: BotRoute;
  text: string;
  replyMarkup?: TelegramInlineKeyboardMarkup;
  callbackAnswer?: BotCallbackAnswer;
  effects?: BotRouteEffects;
  aiInput?: BotAiInput;
};
