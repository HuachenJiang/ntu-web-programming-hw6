import type { TelegramInlineKeyboardMarkup } from "@/types/telegram";

export const BOT_COMMANDS = {
  start: "/start",
  help: "/help",
  newChat: "/newchat",
} as const;

export type BotCommand = (typeof BOT_COMMANDS)[keyof typeof BOT_COMMANDS];

export const BOT_CALLBACK_DATA = {
  aiAnswer: "menu:ai_answer",
  quizMe: "menu:quiz_me",
  studyPlan: "menu:study_plan",
  help: "menu:help",
  newChat: "menu:new_chat",
} as const;

export type BotCallbackData =
  (typeof BOT_CALLBACK_DATA)[keyof typeof BOT_CALLBACK_DATA];

export const BOT_MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "Ask AI", callback_data: BOT_CALLBACK_DATA.aiAnswer }],
    [
      { text: "Quiz me", callback_data: BOT_CALLBACK_DATA.quizMe },
      { text: "Study plan", callback_data: BOT_CALLBACK_DATA.studyPlan },
    ],
    [
      { text: "Help", callback_data: BOT_CALLBACK_DATA.help },
      { text: "New chat", callback_data: BOT_CALLBACK_DATA.newChat },
    ],
  ],
} as const satisfies TelegramInlineKeyboardMarkup;

export const BOT_SCRIPTED_REPLIES = {
  start:
    "Welcome to IB AAHL AI Study Assistant Bot.\n\nChoose a study mode below, or send a math question directly.",
  help: "I can help with IB AAHL questions, quick quizzes, study planning, and fresh conversation starts.\n\nSend a question anytime, or use the buttons below.",
  newChat:
    "New chat started. I will ignore earlier context for the next answer.",
  aiAnswer:
    "Send me an IB AAHL question, and I will help explain it step by step.",
  quizMe:
    "Quiz mode is ready. Send a topic, for example calculus or vectors, and I will prepare a short practice question.",
  studyPlan:
    "Study planning is ready. Send your exam date, target topic, and weekly study time.",
  unsupported:
    "Sorry, I can only handle text messages and menu buttons right now.",
  unknownCallback:
    "Sorry, I do not recognize that menu action. Please choose one of the current buttons.",
} as const;

export const BOT_CALLBACK_ACKNOWLEDGEMENTS = {
  aiAnswer: "Ask AI selected.",
  quizMe: "Quiz mode selected.",
  studyPlan: "Study planning selected.",
  help: "Help selected.",
  newChat: "New chat selected.",
  unknownCallback: "Unknown menu action.",
} as const;
