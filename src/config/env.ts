import { AppError } from "@/errors/app-error";
import type { Result } from "@/types/result";

export const appEnvKeys = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "QWEN_API_KEY",
  "QWEN_MODEL",
  "QWEN_API_BASE_URL",
  "MONGODB_URI",
  "NEXT_PUBLIC_APP_URL",
  "ADMIN_POLLING_INTERVAL_MS",
  "USER_RATE_LIMIT_WINDOW_MS",
  "USER_RATE_LIMIT_MAX_MESSAGES",
  "RECENT_CONTEXT_MESSAGE_LIMIT",
] as const;

export type AppEnvKey = (typeof appEnvKeys)[number];

export type EnvSource = Record<string, string | undefined>;

export type ConfigIssue = {
  key: AppEnvKey;
  message: string;
};

export type AppEnvironmentConfig = {
  telegram: {
    botToken: string;
    webhookSecret: string;
  };
  qwen: {
    apiKey: string;
    model: string;
    apiBaseUrl: string;
  };
  mongodb: {
    uri: string;
  };
  app: {
    publicUrl: string;
  };
  admin: {
    pollingIntervalMs: number;
  };
  rateLimit: {
    userWindowMs: number;
    userMaxMessages: number;
  };
  conversation: {
    recentContextMessageLimit: number;
  };
};

export class ConfigError extends AppError {
  constructor(readonly issues: ConfigIssue[]) {
    super(
      `Invalid environment configuration: ${issues
        .map((issue) => `${issue.key} ${issue.message}`)
        .join("; ")}`,
      "CONFIG_INVALID_ENV",
    );
    this.name = "ConfigError";
  }
}

const placeholderValues = new Set<string>([
  "YOUR_TELEGRAM_BOT_TOKEN",
  "YOUR_TELEGRAM_WEBHOOK_SECRET",
  "YOUR_QWEN_API_KEY",
  "YOUR_MONGODB_ATLAS_CONNECTION_STRING",
  "YOUR_PUBLIC_APP_URL",
]);

function readRequiredString(
  env: EnvSource,
  key: AppEnvKey,
  issues: ConfigIssue[],
): string {
  const value = env[key]?.trim();

  if (!value) {
    issues.push({ key, message: "is required" });
    return "";
  }

  if (placeholderValues.has(value)) {
    issues.push({ key, message: "must be replaced with a real value" });
  }

  return value;
}

function readPositiveInteger(
  env: EnvSource,
  key: AppEnvKey,
  issues: ConfigIssue[],
): number {
  const value = readRequiredString(env, key, issues);
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    issues.push({ key, message: "must be a positive integer" });
    return 0;
  }

  return parsed;
}

function readHttpUrl(
  env: EnvSource,
  key: AppEnvKey,
  issues: ConfigIssue[],
): string {
  const value = readRequiredString(env, key, issues);

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      issues.push({ key, message: "must use http or https" });
    }
  } catch {
    issues.push({ key, message: "must be a valid URL" });
  }

  return value;
}

function readMongoUri(env: EnvSource, issues: ConfigIssue[]): string {
  const key = "MONGODB_URI";
  const value = readRequiredString(env, key, issues);

  if (!value.startsWith("mongodb://") && !value.startsWith("mongodb+srv://")) {
    issues.push({
      key,
      message: "must start with mongodb:// or mongodb+srv://",
    });
  }

  return value;
}

function parseAppConfig(env: EnvSource): AppEnvironmentConfig {
  const issues: ConfigIssue[] = [];
  const config: AppEnvironmentConfig = {
    telegram: {
      botToken: readRequiredString(env, "TELEGRAM_BOT_TOKEN", issues),
      webhookSecret: readRequiredString(env, "TELEGRAM_WEBHOOK_SECRET", issues),
    },
    qwen: {
      apiKey: readRequiredString(env, "QWEN_API_KEY", issues),
      model: readRequiredString(env, "QWEN_MODEL", issues),
      apiBaseUrl: readHttpUrl(env, "QWEN_API_BASE_URL", issues),
    },
    mongodb: {
      uri: readMongoUri(env, issues),
    },
    app: {
      publicUrl: readHttpUrl(env, "NEXT_PUBLIC_APP_URL", issues),
    },
    admin: {
      pollingIntervalMs: readPositiveInteger(
        env,
        "ADMIN_POLLING_INTERVAL_MS",
        issues,
      ),
    },
    rateLimit: {
      userWindowMs: readPositiveInteger(
        env,
        "USER_RATE_LIMIT_WINDOW_MS",
        issues,
      ),
      userMaxMessages: readPositiveInteger(
        env,
        "USER_RATE_LIMIT_MAX_MESSAGES",
        issues,
      ),
    },
    conversation: {
      recentContextMessageLimit: readPositiveInteger(
        env,
        "RECENT_CONTEXT_MESSAGE_LIMIT",
        issues,
      ),
    },
  };

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  return config;
}

export function validateAppConfig(
  env: EnvSource,
): Result<AppEnvironmentConfig, ConfigError> {
  try {
    return {
      ok: true,
      value: parseAppConfig(env),
    };
  } catch (error) {
    if (error instanceof ConfigError) {
      return {
        ok: false,
        error,
      };
    }

    throw error;
  }
}

export function loadAppConfig(
  env: EnvSource = process.env,
): AppEnvironmentConfig {
  return parseAppConfig(env);
}
