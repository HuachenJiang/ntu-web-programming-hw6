import { describe, expect, it } from "vitest";
import { ConfigError, loadAppConfig, validateAppConfig } from "@/config/app";

const validEnv = {
  TELEGRAM_BOT_TOKEN: "123456789:telegram-token",
  TELEGRAM_WEBHOOK_SECRET: "0123456789abcdef",
  QWEN_API_KEY: "sk-qwen-test",
  QWEN_MODEL: "qwen-plus",
  QWEN_API_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  MONGODB_URI:
    "mongodb+srv://user:password@example.mongodb.net/ib-aahl-study-assistant",
  NEXT_PUBLIC_APP_URL: "https://example.ngrok-free.app",
  ADMIN_POLLING_INTERVAL_MS: "5000",
  USER_RATE_LIMIT_WINDOW_MS: "60000",
  USER_RATE_LIMIT_MAX_MESSAGES: "20",
  RECENT_CONTEXT_MESSAGE_LIMIT: "10",
} as const;

describe("environment config", () => {
  it("parses service config and numeric limits", () => {
    const config = loadAppConfig(validEnv);

    expect(config.telegram.botToken).toBe(validEnv.TELEGRAM_BOT_TOKEN);
    expect(config.qwen.model).toBe("qwen-plus");
    expect(config.mongodb.uri).toBe(validEnv.MONGODB_URI);
    expect(config.admin.pollingIntervalMs).toBe(5000);
    expect(config.rateLimit.userWindowMs).toBe(60000);
    expect(config.rateLimit.userMaxMessages).toBe(20);
    expect(config.conversation.recentContextMessageLimit).toBe(10);
  });

  it("reports missing required variables with clear keys", () => {
    const result = validateAppConfig({
      ...validEnv,
      TELEGRAM_BOT_TOKEN: undefined,
      QWEN_API_KEY: "",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ConfigError);
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          { key: "TELEGRAM_BOT_TOKEN", message: "is required" },
          { key: "QWEN_API_KEY", message: "is required" },
        ]),
      );
    }
  });

  it("rejects placeholder and malformed values", () => {
    const result = validateAppConfig({
      ...validEnv,
      NEXT_PUBLIC_APP_URL: "YOUR_PUBLIC_APP_URL",
      MONGODB_URI: "postgres://not-mongodb",
      USER_RATE_LIMIT_MAX_MESSAGES: "0",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.message).toContain("NEXT_PUBLIC_APP_URL");
      expect(result.error.message).toContain("MONGODB_URI");
      expect(result.error.message).toContain("USER_RATE_LIMIT_MAX_MESSAGES");
    }
  });
});
