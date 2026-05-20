export type TelegramChat = {
  id: number;
  type?: string;
};

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  date?: number;
  text?: string;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

export type TelegramSendMessageRequest = {
  chat_id: number;
  text: string;
  reply_markup?: TelegramInlineKeyboardMarkup;
};

export type TelegramSendChatActionRequest = {
  chat_id: number;
  action: "typing";
};

export type TelegramAnswerCallbackQueryRequest = {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
};

export type TelegramApiResponse<T> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      error_code?: number;
      description?: string;
    };
