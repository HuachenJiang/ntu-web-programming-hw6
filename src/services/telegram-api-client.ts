import { loadAppConfig, type AppEnvironmentConfig } from "@/config/app";
import { TelegramApiError } from "@/errors/telegram-api-error";
import { logger, type Logger } from "@/lib/logger";
import type {
  TelegramAnswerCallbackQueryRequest,
  TelegramApiResponse,
  TelegramSendMessageRequest,
} from "@/types/telegram";

type TelegramApiClientOptions = {
  config?: AppEnvironmentConfig;
  fetchImpl?: typeof fetch;
  logger?: Logger;
};

export type TelegramApiClient = {
  sendMessage(request: TelegramSendMessageRequest): Promise<unknown>;
  answerCallbackQuery(
    request: TelegramAnswerCallbackQueryRequest,
  ): Promise<unknown>;
};

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  body: unknown,
  fetchImpl: typeof fetch,
  activeLogger: Logger,
): Promise<T> {
  let response: Response;

  try {
    response = await fetchImpl(
      `https://api.telegram.org/bot${botToken}/${method}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  } catch {
    activeLogger.error({
      event: "telegram_api_request_failed",
      errorCode: "TELEGRAM_API_FAILED",
      method,
      status: null,
      telegramErrorCode: null,
    });

    throw new TelegramApiError(`Telegram API ${method} request failed`);
  }

  const payload = (await response
    .json()
    .catch(() => null)) as TelegramApiResponse<T> | null;

  if (!response.ok) {
    activeLogger.error({
      event: "telegram_api_request_failed",
      errorCode: "TELEGRAM_API_FAILED",
      method,
      status: response.status,
      telegramErrorCode: payload && !payload.ok ? payload.error_code : null,
    });

    throw new TelegramApiError(
      `Telegram API ${method} failed with HTTP ${response.status}`,
      response.status,
      payload && !payload.ok ? payload.error_code : undefined,
    );
  }

  if (!payload?.ok) {
    activeLogger.error({
      event: "telegram_api_request_failed",
      errorCode: "TELEGRAM_API_FAILED",
      method,
      status: response.status,
      telegramErrorCode: payload?.error_code ?? null,
    });

    throw new TelegramApiError(
      payload?.description ?? `Telegram API ${method} returned ok=false`,
      response.status,
      payload?.error_code,
    );
  }

  return payload.result;
}

export function createTelegramApiClient(
  options: TelegramApiClientOptions = {},
): TelegramApiClient {
  const config = options.config ?? loadAppConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const activeLogger = options.logger ?? logger;
  const botToken = config.telegram.botToken;

  return {
    sendMessage(request) {
      return callTelegramApi(
        botToken,
        "sendMessage",
        request,
        fetchImpl,
        activeLogger,
      );
    },
    answerCallbackQuery(request) {
      return callTelegramApi(
        botToken,
        "answerCallbackQuery",
        request,
        fetchImpl,
        activeLogger,
      );
    },
  };
}
