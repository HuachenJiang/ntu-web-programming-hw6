import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnvironmentConfig } from "@/config/app";
import { createQwenClient } from "@/services/qwen-client";

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
    userWindowMs: 60000,
    userMaxMessages: 20,
  },
  conversation: {
    recentContextMessageLimit: 10,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("createQwenClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the OpenAI-compatible endpoint and parses the first choice", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: "  Step-by-step answer.  ",
            },
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const client = createQwenClient({ config, fetchImpl });

    await expect(
      client.generateChatCompletion({
        model: "qwen-plus",
        messages: [{ role: "user", content: "Explain vectors." }],
      }),
    ).resolves.toBe("Step-by-step answer.");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer sk-qwen-test",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          model: "qwen-plus",
          messages: [{ role: "user", content: "Explain vectors." }],
        }),
      }),
    );
  });

  it("throws QwenApiError for network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const client = createQwenClient({ config, fetchImpl });

    await expect(
      client.generateChatCompletion({
        model: "qwen-plus",
        messages: [{ role: "user", content: "Explain vectors." }],
      }),
    ).rejects.toMatchObject({
      code: "QWEN_API_FAILED",
      kind: "api_failed",
    });
  });

  it("throws timeout QwenApiError when the request exceeds the client timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Request aborted", "AbortError"));
          });
        }),
    ) as unknown as typeof fetch;
    const client = createQwenClient({ config, fetchImpl });
    const promise = client.generateChatCompletion({
      model: "qwen-plus",
      messages: [{ role: "user", content: "Explain vectors." }],
    });
    const assertion = expect(promise).rejects.toMatchObject({
      code: "QWEN_API_TIMEOUT",
      kind: "timeout",
    });

    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
  });

  it("throws QwenApiError for non-2xx responses", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: "InvalidApiKey",
            message: "Bad key",
          },
        },
        401,
      ),
    ) as unknown as typeof fetch;
    const client = createQwenClient({ config, fetchImpl });

    await expect(
      client.generateChatCompletion({
        model: "qwen-plus",
        messages: [{ role: "user", content: "Explain vectors." }],
      }),
    ).rejects.toMatchObject({
      status: 401,
      qwenErrorCode: "InvalidApiKey",
      responseSummary: "InvalidApiKey: Bad key",
      kind: "api_failed",
    });
  });

  it("maps HTTP 429 responses to Qwen rate limit errors", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: "TooManyRequests",
            message: "Rate limit exceeded",
          },
        },
        429,
      ),
    ) as unknown as typeof fetch;
    const client = createQwenClient({ config, fetchImpl });

    await expect(
      client.generateChatCompletion({
        model: "qwen-plus",
        messages: [{ role: "user", content: "Explain vectors." }],
      }),
    ).rejects.toMatchObject({
      code: "QWEN_API_RATE_LIMITED",
      status: 429,
      kind: "rate_limited",
    });
  });

  it("maps quota response signals to Qwen quota errors", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: "QuotaExceeded",
            message: "Your usage limit has been exceeded",
          },
        },
        403,
      ),
    ) as unknown as typeof fetch;
    const client = createQwenClient({ config, fetchImpl });

    await expect(
      client.generateChatCompletion({
        model: "qwen-plus",
        messages: [{ role: "user", content: "Explain vectors." }],
      }),
    ).rejects.toMatchObject({
      code: "QWEN_API_QUOTA_EXCEEDED",
      status: 403,
      kind: "quota_exceeded",
    });
  });

  it.each([[{ choices: [] }], [{ choices: [{ message: { content: null } }] }]])(
    "throws QwenApiError for invalid success payload %#",
    async (payload) => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(payload),
      ) as unknown as typeof fetch;
      const client = createQwenClient({ config, fetchImpl });

      await expect(
        client.generateChatCompletion({
          model: "qwen-plus",
          messages: [{ role: "user", content: "Explain vectors." }],
        }),
      ).rejects.toMatchObject({
        code: "QWEN_API_INVALID_RESPONSE",
        kind: "invalid_response",
      });
    },
  );
});
