import { loadAppConfig, type AppEnvironmentConfig } from "@/config/app";

export type RateLimitCheckInput = {
  userKey: string;
  now?: number;
};

export type RateLimitCheckResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      retryAfterMs: number;
    };

export type RateLimiter = {
  check(input: RateLimitCheckInput): RateLimitCheckResult;
};

type RateLimitBucket = {
  windowStartedAt: number;
  count: number;
};

export function createInMemoryRateLimiter(
  config: AppEnvironmentConfig = loadAppConfig(),
): RateLimiter {
  const buckets = new Map<string, RateLimitBucket>();
  const windowMs = config.rateLimit.userWindowMs;
  const maxMessages = config.rateLimit.userMaxMessages;

  return {
    check(input) {
      const now = input.now ?? Date.now();
      const bucket = buckets.get(input.userKey);

      if (!bucket || now - bucket.windowStartedAt >= windowMs) {
        buckets.set(input.userKey, {
          windowStartedAt: now,
          count: 1,
        });

        return { allowed: true };
      }

      if (bucket.count >= maxMessages) {
        return {
          allowed: false,
          retryAfterMs: Math.max(windowMs - (now - bucket.windowStartedAt), 0),
        };
      }

      bucket.count += 1;
      return { allowed: true };
    },
  };
}

let defaultUserRateLimiter: RateLimiter | null = null;

export function getDefaultUserRateLimiter(
  config: AppEnvironmentConfig = loadAppConfig(),
): RateLimiter {
  defaultUserRateLimiter ??= createInMemoryRateLimiter(config);
  return defaultUserRateLimiter;
}
