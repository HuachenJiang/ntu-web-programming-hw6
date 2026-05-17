import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredEnvKeys = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"];

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const values = {};
  const content = readFileSync(path, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function readCliOptions(args) {
  const options = {
    dropPendingUpdates: false,
    url: null,
  };

  for (const arg of args) {
    if (arg === "--drop-pending-updates") {
      options.dropPendingUpdates = true;
      continue;
    }

    if (arg.startsWith("--url=")) {
      options.url = arg.slice("--url=".length);
    }
  }

  return options;
}

function getConfig() {
  const env = {
    ...parseEnvFile(resolve(".env")),
    ...parseEnvFile(resolve(".env.local")),
    ...process.env,
  };
  const options = readCliOptions(process.argv.slice(2));
  const requiredKeys = options.url
    ? requiredEnvKeys
    : [...requiredEnvKeys, "NEXT_PUBLIC_APP_URL"];
  const missingKeys = requiredKeys.filter((key) => !env[key]?.trim());

  if (missingKeys.length > 0) {
    throw new Error(`Missing required env vars: ${missingKeys.join(", ")}`);
  }

  return env;
}

function buildWebhookUrl(publicAppUrl, overrideUrl) {
  const webhookUrl = overrideUrl
    ? new URL(overrideUrl)
    : new URL("/api/telegram/webhook", publicAppUrl);

  if (webhookUrl.protocol !== "https:") {
    throw new Error(`Telegram webhook URL must use https: ${webhookUrl.href}`);
  }

  return webhookUrl.href;
}

async function callTelegramApi(botToken, method, body) {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    const description =
      payload?.description ??
      `Telegram ${method} failed with HTTP ${response.status}`;
    throw new Error(description);
  }

  return payload.result;
}

async function main() {
  const options = readCliOptions(process.argv.slice(2));
  const config = getConfig();
  const webhookUrl = buildWebhookUrl(config.NEXT_PUBLIC_APP_URL, options.url);

  console.log(`Registering Telegram webhook: ${webhookUrl}`);

  const setWebhookResult = await callTelegramApi(
    config.TELEGRAM_BOT_TOKEN,
    "setWebhook",
    {
      url: webhookUrl,
      secret_token: config.TELEGRAM_WEBHOOK_SECRET,
      drop_pending_updates: options.dropPendingUpdates,
    },
  );

  console.log(`setWebhook ok: ${setWebhookResult}`);

  const webhookInfo = await callTelegramApi(
    config.TELEGRAM_BOT_TOKEN,
    "getWebhookInfo",
    {},
  );

  console.log(
    JSON.stringify(
      {
        url: webhookInfo.url,
        pending_update_count: webhookInfo.pending_update_count,
        last_error_date: webhookInfo.last_error_date,
        last_error_message: webhookInfo.last_error_message,
        max_connections: webhookInfo.max_connections,
        allowed_updates: webhookInfo.allowed_updates,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
