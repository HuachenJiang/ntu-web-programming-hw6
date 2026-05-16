import { describe, expect, it } from "vitest";
import {
  BOT_CALLBACK_ACKNOWLEDGEMENTS,
  BOT_CALLBACK_DATA,
  BOT_MENU_KEYBOARD,
  BOT_SCRIPTED_REPLIES,
} from "@/lib/bot-scripts";
import { routeTelegramUpdate } from "@/services/telegram-router";
import type { BotRoute } from "@/types/bot";
import type { TelegramUpdate } from "@/types/telegram";

const chatId = 1001;

function textUpdate(text?: string): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      chat: {
        id: chatId,
        type: "private",
      },
      text,
    },
  };
}

function callbackUpdate(data?: string): TelegramUpdate {
  return {
    update_id: 2,
    callback_query: {
      id: "callback-1",
      from: {
        id: 2002,
        first_name: "Test",
      },
      message: {
        message_id: 11,
        chat: {
          id: chatId,
          type: "private",
        },
      },
      data,
    },
  };
}

describe("routeTelegramUpdate", () => {
  it("routes /start to welcome copy and the menu keyboard", () => {
    const result = routeTelegramUpdate(textUpdate("/start"));

    expect(result).toMatchObject({
      chatId,
      route: "start",
      text: BOT_SCRIPTED_REPLIES.start,
      replyMarkup: BOT_MENU_KEYBOARD,
    });
  });

  it("routes /help to help copy", () => {
    const result = routeTelegramUpdate(textUpdate("/help"));

    expect(result).toMatchObject({
      chatId,
      route: "help",
      text: BOT_SCRIPTED_REPLIES.help,
      replyMarkup: BOT_MENU_KEYBOARD,
    });
  });

  it("routes /newchat to a reset effect", () => {
    const result = routeTelegramUpdate(textUpdate("/newchat"));

    expect(result).toMatchObject({
      chatId,
      route: "new_chat",
      text: BOT_SCRIPTED_REPLIES.newChat,
      effects: {
        resetConversation: true,
      },
    });
  });

  it.each([
    [
      BOT_CALLBACK_DATA.aiAnswer,
      "ai_answer",
      BOT_SCRIPTED_REPLIES.aiAnswer,
      BOT_CALLBACK_ACKNOWLEDGEMENTS.aiAnswer,
    ],
    [
      BOT_CALLBACK_DATA.quizMe,
      "quiz_me",
      BOT_SCRIPTED_REPLIES.quizMe,
      BOT_CALLBACK_ACKNOWLEDGEMENTS.quizMe,
    ],
    [
      BOT_CALLBACK_DATA.studyPlan,
      "study_plan",
      BOT_SCRIPTED_REPLIES.studyPlan,
      BOT_CALLBACK_ACKNOWLEDGEMENTS.studyPlan,
    ],
    [
      BOT_CALLBACK_DATA.help,
      "help",
      BOT_SCRIPTED_REPLIES.help,
      BOT_CALLBACK_ACKNOWLEDGEMENTS.help,
    ],
    [
      BOT_CALLBACK_DATA.newChat,
      "new_chat",
      BOT_SCRIPTED_REPLIES.newChat,
      BOT_CALLBACK_ACKNOWLEDGEMENTS.newChat,
    ],
  ] satisfies Array<[string, BotRoute, string, string]>)(
    "routes callback %s",
    (callbackData, route, text, callbackText) => {
      const result = routeTelegramUpdate(callbackUpdate(callbackData));

      expect(result).toMatchObject({
        chatId,
        route,
        text,
        callbackAnswer: {
          callbackQueryId: "callback-1",
          text: callbackText,
        },
      });

      if (route === "new_chat") {
        expect(result.effects).toEqual({ resetConversation: true });
      }
    },
  );

  it("routes ordinary text to the AI answer flow with input preserved", () => {
    const result = routeTelegramUpdate(
      textUpdate("Explain integration by parts."),
    );

    expect(result).toMatchObject({
      chatId,
      route: "ai_answer",
      text: BOT_SCRIPTED_REPLIES.aiAnswer,
      replyMarkup: BOT_MENU_KEYBOARD,
      aiInput: {
        text: "Explain integration by parts.",
      },
    });
  });

  it("returns unsupported copy for non-text message payloads", () => {
    const result = routeTelegramUpdate(textUpdate());

    expect(result).toMatchObject({
      chatId,
      route: "unsupported",
      text: BOT_SCRIPTED_REPLIES.unsupported,
    });
  });

  it("returns unknown callback copy for unrecognized callback data", () => {
    const result = routeTelegramUpdate(callbackUpdate("menu:old_action"));

    expect(result).toMatchObject({
      chatId,
      route: "unknown_callback",
      text: BOT_SCRIPTED_REPLIES.unknownCallback,
      callbackAnswer: {
        callbackQueryId: "callback-1",
        text: BOT_CALLBACK_ACKNOWLEDGEMENTS.unknownCallback,
      },
    });
  });
});
