import { describe, expect, it } from "vitest";
import type { AppEnvironmentConfig } from "@/config/app";
import { createInMemoryRateLimiter } from "@/services/rate-limiter";

const config: AppEnvironmentConfig = {
  telegram: {
    botToken: "123456789:test-token",
    webhookSecret: "test-secret",
  },
  qwen: {
    apiKey: "sk-qwen-test",
    model: "qwen-plus",
    apiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  mongodb: {
    uri: "mongodb+srv://user:password@example.mongodb.net/test",
  },
  app: {
    publicUrl: "https://example.ngrok-free.app",
  },
  admin: {
    pollingIntervalMs: 5000,
  },
  rateLimit: {
    userWindowMs: 1000,
    userMaxMessages: 2,
  },
  conversation: {
    recentContextMessageLimit: 10,
  },
};

describe("createInMemoryRateLimiter", () => {
  it("rejects the same user after the configured window limit", () => {
    const limiter = createInMemoryRateLimiter(config);

    expect(limiter.check({ userKey: "user:1", now: 0 })).toEqual({
      allowed: true,
    });
    expect(limiter.check({ userKey: "user:1", now: 100 })).toEqual({
      allowed: true,
    });
    expect(limiter.check({ userKey: "user:1", now: 200 })).toEqual({
      allowed: false,
      retryAfterMs: 800,
    });
  });

  it("allows the same user again after the window expires", () => {
    const limiter = createInMemoryRateLimiter(config);

    limiter.check({ userKey: "user:1", now: 0 });
    limiter.check({ userKey: "user:1", now: 100 });

    expect(limiter.check({ userKey: "user:1", now: 1000 })).toEqual({
      allowed: true,
    });
  });

  it("tracks different users independently", () => {
    const limiter = createInMemoryRateLimiter(config);

    limiter.check({ userKey: "user:1", now: 0 });
    limiter.check({ userKey: "user:1", now: 100 });

    expect(limiter.check({ userKey: "user:2", now: 200 })).toEqual({
      allowed: true,
    });
  });
});
