import { describe, expect, it, vi } from "vitest";
import type { AppEnvironmentConfig } from "@/config/app";
import { QwenApiError } from "@/errors/qwen-api-error";
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
    ).rejects.toBeInstanceOf(QwenApiError);
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
      ).rejects.toBeInstanceOf(QwenApiError);
    },
  );
});
