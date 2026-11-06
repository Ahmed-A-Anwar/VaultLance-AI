import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAiProviderForTests,
  completeAi,
  probeAzure,
} from "../src/ai/provider.js";

const ORIGINAL_ENV = { ...process.env };
const jsonHeaders = { "content-type": "application/json" };

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...headers },
  });
}

function azureChat(content: string, finishReason = "stop"): Response {
  return response(200, {
    choices: [{ message: { content }, finish_reason: finishReason }],
  });
}

function geminiText(content: string): Response {
  return response(200, {
    candidates: [{ content: { parts: [{ text: content }] }, finishReason: "STOP" }],
  });
}

function groqText(content: string): Response {
  return response(200, {
    choices: [{ message: { content }, finish_reason: "stop" }],
  });
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return vi.mocked(globalThis.fetch);
}

describe("AI provider chain", () => {
  beforeEach(() => {
    __resetAiProviderForTests();
    process.env.AZURE_OPENAI_KEY = "azure-test-key";
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-5-mini";
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.GROQ_API_KEY = "groq-test-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("uses Azure chat completions with GPT-5-mini parameters and JSON schema", async () => {
    fetchMock().mockResolvedValueOnce(azureChat('{"ok":true}'));

    const answer = await completeAi({
      prompt: "Return {\"ok\":true}",
      purpose: "chat",
      jsonSchema: {
        name: "probe",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    });

    expect(answer.provider).toBe("azure");
    expect(answer.cached).toBe(false);
    expect(answer.text).toBe('{"ok":true}');
    expect(answer.json).toEqual({ ok: true });
    expect(answer.maxCompletionTokens).toBe(600);

    const [url, init] = fetchMock().mock.calls[0];
    expect(String(url)).toContain("/openai/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.max_completion_tokens).toBe(600);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.reasoning_effort).toBe("low");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.model).toBe("gpt-5-mini");
  });

  it("retries an empty/truncated Azure answer once with a higher cap", async () => {
    fetchMock()
      .mockResolvedValueOnce(azureChat("", "length"))
      .mockResolvedValueOnce(azureChat("ok"));

    const answer = await completeAi({ prompt: "Say ok", purpose: "chat" });

    expect(answer.provider).toBe("azure");
    expect(answer.text).toBe("ok");
    expect(answer.retriedWithHigherCap).toBe(true);
    expect(answer.maxCompletionTokens).toBe(1200);

    const secondBody = JSON.parse(String(fetchMock().mock.calls[1][1].body));
    expect(secondBody.max_completion_tokens).toBe(1200);
  });

  it("drops reasoning_effort when Azure rejects it, then succeeds", async () => {
    fetchMock()
      .mockResolvedValueOnce(
        response(400, {
          error: {
            code: "invalid_request_error",
            message: "Unsupported parameter: reasoning_effort",
          },
        })
      )
      .mockResolvedValueOnce(azureChat("ok"));

    const answer = await completeAi({ prompt: "Say ok" });

    expect(answer.provider).toBe("azure");
    expect(answer.droppedParams).toContain("reasoning_effort");
    const retryBody = JSON.parse(String(fetchMock().mock.calls[1][1].body));
    expect(retryBody.reasoning_effort).toBeUndefined();
    expect(retryBody.max_completion_tokens).toBe(600);
  });

  it("falls through an Azure 429 to Groq and honors the cooldown", async () => {
    fetchMock()
      .mockResolvedValueOnce(
        response(429, { error: { code: "rate_limit_exceeded" } }, { "retry-after": "60" })
      )
      .mockResolvedValueOnce(groqText("from groq"))
      .mockResolvedValueOnce(groqText("still groq"));

    const first = await completeAi({ prompt: "Say ok" });
    const second = await completeAi({ prompt: "Say ok" });

    expect(first.provider).toBe("groq");
    expect(second.provider).toBe("groq");
    expect(fetchMock()).toHaveBeenCalledTimes(3);
    expect(String(fetchMock().mock.calls[0][0])).toContain("/openai/v1/chat/completions");
    expect(String(fetchMock().mock.calls[1][0])).toContain("api.groq.com");
    expect(String(fetchMock().mock.calls[2][0])).toContain("api.groq.com");
  });

  it("falls through invalid Azure JSON to Groq", async () => {
    fetchMock()
      .mockResolvedValueOnce(azureChat("not json"))
      .mockResolvedValueOnce(groqText('{"ok":true}'));

    const answer = await completeAi({
      prompt: "Return JSON",
      jsonSchema: {
        name: "probe",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
    });

    expect(answer.provider).toBe("groq");
    expect(answer.json).toEqual({ ok: true });
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("uses Gemini third, after Azure and Groq both fail", async () => {
    fetchMock()
      .mockResolvedValueOnce(response(401, { error: { code: "unauthorized" } }))
      .mockResolvedValueOnce(response(500, { error: { code: "server_error" } }))
      .mockResolvedValueOnce(response(500, { error: { code: "server_error" } }))
      .mockResolvedValueOnce(geminiText("from gemini"));

    const answer = await completeAi({ prompt: "Say ok" });

    expect(answer.provider).toBe("gemini");
    expect(fetchMock()).toHaveBeenCalledTimes(4);
    expect(String(fetchMock().mock.calls[1][0])).toContain("api.groq.com");
    expect(String(fetchMock().mock.calls[3][0])).toContain("generativelanguage.googleapis.com");
  });

  it("rejects schema-invalid JSON and falls through", async () => {
    fetchMock()
      .mockResolvedValueOnce(azureChat('{"ok":"yes"}'))
      .mockResolvedValueOnce(groqText('{"ok":true}'));

    const answer = await completeAi({
      prompt: "Return JSON",
      jsonSchema: {
        name: "probe",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    });

    expect(answer.provider).toBe("groq");
    expect(answer.json).toEqual({ ok: true });
  });

  it("opens a 60s breaker for a provider that failed", async () => {
    fetchMock()
      .mockResolvedValueOnce(response(500, { error: { code: "server_error" } }))
      .mockResolvedValueOnce(response(500, { error: { code: "server_error" } }))
      .mockResolvedValueOnce(groqText("from groq"))
      .mockResolvedValueOnce(groqText("from groq again"));

    const first = await completeAi({ prompt: "Say ok" });
    const second = await completeAi({ prompt: "Say ok" });

    expect(first.provider).toBe("groq");
    expect(second.provider).toBe("groq");
    expect(fetchMock()).toHaveBeenCalledTimes(4);
    expect(String(fetchMock().mock.calls[2][0])).toContain("api.groq.com");
    expect(String(fetchMock().mock.calls[3][0])).toContain("api.groq.com");
  });

  it("returns the last answer with cached: true when every provider fails", async () => {
    fetchMock().mockResolvedValueOnce(azureChat("the last known answer"));
    const first = await completeAi({ prompt: "Explain the vault" });
    expect(first.cached).toBe(false);

    fetchMock().mockRejectedValue(
      Object.assign(new Error("timed out"), { name: "TimeoutError" })
    );

    const fallback = await completeAi({ prompt: "Explain the vault" });
    expect(fallback.provider).toBe("cache");
    expect(fallback.cached).toBe(true);
    expect(fallback.text).toBe("the last known answer");
    expect(fallback.attempts.some((attempt) => attempt.errorCode === "timeout")).toBe(true);
  });

  it("probes Azure without exposing the key or endpoint", async () => {
    fetchMock().mockResolvedValueOnce(azureChat('{"ok":true}'));

    const report = await probeAzure();

    expect(report).toMatchObject({
      configured: true,
      status: 200,
      surface: "chat.completions",
      jsonSchema: true,
    });
    expect(report.droppedParams).toEqual([]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("azure-test-key");
    expect(serialized).not.toContain("example.openai.azure.com");
  });

  it("falls to Groq when both Azure and Gemini fail", async () => {
    process.env.GEMINI_API_KEY = "";
    fetchMock()
      .mockResolvedValueOnce(response(401, { error: { code: "unauthorized" } }))
      .mockResolvedValueOnce(groqText("from groq"));

    const answer = await completeAi({ prompt: "Say ok" });

    expect(answer.provider).toBe("groq");
    expect(String(fetchMock().mock.calls[1][0])).toContain("api.groq.com");
  });
});
