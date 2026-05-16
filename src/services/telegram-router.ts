import {
  BOT_CALLBACK_ACKNOWLEDGEMENTS,
  BOT_CALLBACK_DATA,
  BOT_COMMANDS,
  BOT_MENU_KEYBOARD,
  BOT_SCRIPTED_REPLIES,
  type BotCallbackData,
  type BotCommand,
} from "@/lib/bot-scripts";
import type { BotRoute, BotRouteResult } from "@/types/bot";
import type { TelegramCallbackQuery, TelegramUpdate } from "@/types/telegram";

type ScriptedRouteOptions = {
  callbackQueryId?: string;
  callbackText?: string;
  effects?: BotRouteResult["effects"];
};

const commandRoutes: Record<BotCommand, BotRoute> = {
  [BOT_COMMANDS.start]: "start",
  [BOT_COMMANDS.help]: "help",
  [BOT_COMMANDS.newChat]: "new_chat",
};

const callbackRoutes: Record<BotCallbackData, BotRoute> = {
  [BOT_CALLBACK_DATA.aiAnswer]: "ai_answer",
  [BOT_CALLBACK_DATA.quizMe]: "quiz_me",
  [BOT_CALLBACK_DATA.studyPlan]: "study_plan",
  [BOT_CALLBACK_DATA.help]: "help",
  [BOT_CALLBACK_DATA.newChat]: "new_chat",
};

const callbackAcknowledgements: Record<BotCallbackData, string> = {
  [BOT_CALLBACK_DATA.aiAnswer]: BOT_CALLBACK_ACKNOWLEDGEMENTS.aiAnswer,
  [BOT_CALLBACK_DATA.quizMe]: BOT_CALLBACK_ACKNOWLEDGEMENTS.quizMe,
  [BOT_CALLBACK_DATA.studyPlan]: BOT_CALLBACK_ACKNOWLEDGEMENTS.studyPlan,
  [BOT_CALLBACK_DATA.help]: BOT_CALLBACK_ACKNOWLEDGEMENTS.help,
  [BOT_CALLBACK_DATA.newChat]: BOT_CALLBACK_ACKNOWLEDGEMENTS.newChat,
};

const routeReplies: Record<BotRoute, string> = {
  start: BOT_SCRIPTED_REPLIES.start,
  help: BOT_SCRIPTED_REPLIES.help,
  new_chat: BOT_SCRIPTED_REPLIES.newChat,
  ai_answer: BOT_SCRIPTED_REPLIES.aiAnswer,
  quiz_me: BOT_SCRIPTED_REPLIES.quizMe,
  study_plan: BOT_SCRIPTED_REPLIES.studyPlan,
  unsupported: BOT_SCRIPTED_REPLIES.unsupported,
  unknown_callback: BOT_SCRIPTED_REPLIES.unknownCallback,
};

function extractCommand(text: string): BotCommand | null {
  const [firstToken] = text.trim().split(/\s+/, 1);
  const command = firstToken?.split("@", 1)[0];

  if (command && command in commandRoutes) {
    return command as BotCommand;
  }

  return null;
}

function buildScriptedRouteResult(
  chatId: number | null,
  route: BotRoute,
  options: ScriptedRouteOptions = {},
): BotRouteResult {
  return {
    chatId,
    route,
    text: routeReplies[route],
    replyMarkup: BOT_MENU_KEYBOARD,
    ...(options.callbackQueryId
      ? {
          callbackAnswer: {
            callbackQueryId: options.callbackQueryId,
            text: options.callbackText ?? "",
          },
        }
      : {}),
    ...(options.effects ? { effects: options.effects } : {}),
  };
}

function routeCallbackQuery(
  callbackQuery: TelegramCallbackQuery,
): BotRouteResult {
  const chatId = callbackQuery.message?.chat.id ?? null;
  const callbackData = callbackQuery.data;

  if (callbackData && callbackData in callbackRoutes) {
    const typedCallbackData = callbackData as BotCallbackData;
    const route = callbackRoutes[typedCallbackData];

    return buildScriptedRouteResult(chatId, route, {
      callbackQueryId: callbackQuery.id,
      callbackText: callbackAcknowledgements[typedCallbackData],
      effects: route === "new_chat" ? { resetConversation: true } : undefined,
    });
  }

  return buildScriptedRouteResult(chatId, "unknown_callback", {
    callbackQueryId: callbackQuery.id,
    callbackText: BOT_CALLBACK_ACKNOWLEDGEMENTS.unknownCallback,
  });
}

export function routeTelegramUpdate(update: TelegramUpdate): BotRouteResult {
  if (update.callback_query) {
    return routeCallbackQuery(update.callback_query);
  }

  const chatId = update.message?.chat.id ?? null;
  const text = update.message?.text?.trim();

  if (!text) {
    return buildScriptedRouteResult(chatId, "unsupported");
  }

  const command = extractCommand(text);

  if (command) {
    const route = commandRoutes[command];

    return buildScriptedRouteResult(chatId, route, {
      effects: route === "new_chat" ? { resetConversation: true } : undefined,
    });
  }

  return {
    chatId,
    route: "ai_answer",
    text: BOT_SCRIPTED_REPLIES.aiAnswer,
    replyMarkup: BOT_MENU_KEYBOARD,
    aiInput: {
      text,
    },
  };
}
