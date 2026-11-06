/**
 * ai/provider.ts — the one OpenAI-compatible provider chain.
 *
 * Order is fixed: Azure OpenAI -> Groq -> Gemini -> last known answer.
 * Azure is the only provider configured for GPT-5-mini here, so its requests
 * use `max_completion_tokens` (never the deprecated `max_tokens`) and omit
 * `temperature`. `reasoning_effort` is tried at "low"; if Azure rejects it the
 * parameter is dropped for the retry. A 429 puts that Azure key in cooldown for
 * the Retry-After window, so concurrent callers do not hammer it.
 *
 * No endpoint, deployment name, key or prompt is logged from this module.
 */
import crypto from "node:crypto";
import { logger } from "../shared/logger.js";

export type AiPurpose = "chat" | "report";
export type AiProviderName = "azure" | "gemini" | "groq" | "cache";
export type AzureSurface = "chat.completions" | "responses";

export interface AiJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface AiCompleteOptions {
  prompt: string;
  system?: string;
  purpose?: AiPurpose;
  jsonSchema?: AiJsonSchema;
  /** Stable key for the exact-answer cache; otherwise derived from the inputs. */
  cacheKey?: string;
  /** Optional override; defaults to 600 for chat and 1500 for reports. */
  maxCompletionTokens?: number;
}

export interface AiAttempt {
  provider: "azure" | "gemini" | "groq";
  surface?: AzureSurface;
  status?: number;
  ok: boolean;
  errorCode?: string;
  droppedParams: string[];
  latencyMs: number;
  maxCompletionTokens?: number;
}

export interface AiAnswer {
  text: string;
  json?: unknown;
  provider: AiProviderName;
  model: string;
  cached: boolean;
  purpose: AiPurpose;
  droppedParams: string[];
  maxCompletionTokens: number;
  retriedWithHigherCap: boolean;
  attempts: AiAttempt[];
}

export interface AzureProbeReport {
  configured: boolean;
  status: number | null;
  surface: AzureSurface | null;
  jsonSchema: boolean | null;
  droppedParams: string[];
  errorCode?: string;
  latencyMs: number;
  cooldownSeconds: number | null;
}

const CHAT_CAP = 600;
const REPORT_CAP = 1500;
const PROVIDER_TIMEOUT_MS = 8_000;
const DEFAULT_COOLDOWN_SECONDS = 60;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const PROBE_PROMPT = "Reply with {\"ok\":true}";
const PROBE_SCHEMA: AiJsonSchema = {
  name: "probe",
  strict: true,
  schema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  },
};

interface CacheEntry {
  text: string;
  json?: unknown;
  provider: AiProviderName;
  model: string;
  purpose: AiPurpose;
  storedAt: number;
}

interface ProviderSuccess {
  text: string;
  json?: unknown;
  provider: "azure" | "gemini" | "groq";
  model: string;
  surface?: AzureSurface;
  status?: number;
  droppedParams: string[];
  maxCompletionTokens: number;
  retriedWithHigherCap: boolean;
  jsonSchemaWorked: boolean;
}

interface HttpResult {
  status: number;
  ok: boolean;
  headers: Headers;
  bodyText: string;
  latencyMs: number;
}

class ProviderFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
    public readonly surface?: AzureSurface,
    public readonly retryAfterSeconds?: number,
    public readonly bodyText?: string
  ) {
    super(code);
    this.name = "ProviderFailure";
  }
}

export class AiUnavailableError extends Error {
  public readonly code = "AI_UNAVAILABLE";
  public readonly attempts: AiAttempt[];

  constructor(attempts: AiAttempt[]) {
    super("All AI providers failed and no cached answer is available.");
    this.name = "AiUnavailableError";
    this.attempts = attempts;
  }
}

const cache = new Map<string, CacheEntry>();
const lastByPurpose = new Map<AiPurpose, string>();
const azureCooldownUntil = new Map<string, number>();
const providerCooldownUntil = new Map<string, number>();

function providerCooldownSeconds(name: string): number {
  const until = providerCooldownUntil.get(name);
  if (!until) return 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  if (remaining <= 0) {
    providerCooldownUntil.delete(name);
    return 0;
  }
  return remaining;
}

function openProviderCircuit(name: string): void {
  providerCooldownUntil.set(name, Date.now() + DEFAULT_COOLDOWN_SECONDS * 1000);
}

function clearProviderCircuit(name: string): void {
  providerCooldownUntil.delete(name);
}

function azureConfig(): {
  key: string;
  endpoint: string;
  deployment: string;
  apiVersion: string;
} | null {
  const key = (process.env.AZURE_OPENAI_KEY || "").trim();
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").trim();
  const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT || "").trim();
  if (!key || !endpoint || !deployment) return null;
  return {
    key,
    endpoint,
    deployment,
    apiVersion: (process.env.AZURE_OPENAI_API_VERSION || "2025-04-01-preview").trim(),
  };
}

function geminiConfig(): { key: string; model: string } | null {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) return null;
  return {
    key,
    model: (process.env.GEMINI_MODEL || "gemini-3.1-flash-lite").trim(),
  };
}

function groqConfig(): { key: string; model: string } | null {
  const key = (process.env.GROQ_API_KEY || "").trim();
  if (!key) return null;
  return {
    key,
    model: (process.env.GROQ_MODEL || "openai/gpt-oss-20b").trim(),
  };
}

function purposeOf(options: AiCompleteOptions): AiPurpose {
  return options.purpose === "report" ? "report" : "chat";
}

function capFor(options: AiCompleteOptions): number {
  const requested = Number(options.maxCompletionTokens);
  if (Number.isFinite(requested) && requested > 0) return Math.floor(requested);
  return purposeOf(options) === "report" ? REPORT_CAP : CHAT_CAP;
}

function higherCap(cap: number): number {
  return Math.max(cap + 300, cap * 2);
}

function cacheKeyFor(options: AiCompleteOptions): string {
  if (options.cacheKey) return options.cacheKey;
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        purpose: purposeOf(options),
        system: options.system || "",
        prompt: options.prompt,
        schema: options.jsonSchema || null,
      })
    )
    .digest("hex");
}

function remember(key: string, entry: CacheEntry): void {
  cache.set(key, entry);
  lastByPurpose.set(entry.purpose, key);
  const now = Date.now();
  for (const [cachedKey, cached] of cache) {
    if (now - cached.storedAt > CACHE_TTL_MS) cache.delete(cachedKey);
  }
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function cachedAnswer(key: string, purpose: AiPurpose): CacheEntry | null {
  const exact = cache.get(key);
  if (exact && Date.now() - exact.storedAt <= CACHE_TTL_MS) return exact;
  if (exact) cache.delete(key);

  const lastKey = lastByPurpose.get(purpose);
  if (!lastKey) return null;
  const last = cache.get(lastKey);
  if (!last || last.purpose !== purpose || Date.now() - last.storedAt > CACHE_TTL_MS) return null;
  return last;
}

function azureKeyId(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function cooldownSecondsFor(key: string): number {
  const until = azureCooldownUntil.get(azureKeyId(key));
  if (!until) return 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  if (remaining <= 0) {
    azureCooldownUntil.delete(azureKeyId(key));
    return 0;
  }
  return remaining;
}

function setCooldown(key: string, seconds: number): void {
  const safe = Math.max(0, Math.floor(seconds));
  azureCooldownUntil.set(azureKeyId(key), Date.now() + safe * 1000);
}

function retryAfterSeconds(headers: Headers): number {
  const raw = headers.get("retry-after");
  if (!raw) return DEFAULT_COOLDOWN_SECONDS;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.floor(numeric);

  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return DEFAULT_COOLDOWN_SECONDS;
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<HttpResult> {
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new ProviderFailure("timeout");
      }
      throw new ProviderFailure("unreachable");
    }

    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      throw new ProviderFailure("invalid_json", response.status);
    }

    if (response.status >= 500 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      bodyText,
      latencyMs: Date.now() - started,
    };
  }
  throw new ProviderFailure("server_error", 500);
}

function parseBody(bodyText: string, status?: number): any {
  try {
    return JSON.parse(bodyText);
  } catch {
    throw new ProviderFailure("invalid_json", status);
  }
}

function errorCode(bodyText: string): string {
  try {
    const body = JSON.parse(bodyText);
    return String(body?.error?.code || body?.error?.type || body?.code || "http_error").slice(0, 80);
  } catch {
    return "http_error";
  }
}

function rejectsParam(bodyText: string, names: string[]): boolean {
  const body = bodyText.toLowerCase();
  const namesIt = names.some((name) => body.includes(name.toLowerCase()));
  return namesIt && /(unsupported|not supported|unrecognized|unknown|invalid)/.test(body);
}

function isSurfaceUnavailable(bodyText: string): boolean {
  const body = bodyText.toLowerCase();
  return (
    /(unknown|not found|unsupported|no route|does not exist)/.test(body) &&
    /(url|path|endpoint|route|operation|api)/.test(body)
  );
}

function normalizeAzureEndpoint(endpoint: string): string {
  return endpoint
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/openai\/v1$/i, "")
    .replace(/\/openai$/i, "");
}

function azureRoutes(cfg: { endpoint: string; deployment: string; apiVersion: string }): Array<{
  surface: AzureSurface;
  style: "v1" | "legacy";
  url: string;
}> {
  const base = normalizeAzureEndpoint(cfg.endpoint);
  const deployment = encodeURIComponent(cfg.deployment);
  const version = encodeURIComponent(cfg.apiVersion);
  return [
    {
      surface: "chat.completions",
      style: "v1",
      url: `${base}/openai/v1/chat/completions`,
    },
    {
      surface: "responses",
      style: "v1",
      url: `${base}/openai/v1/responses`,
    },
    {
      surface: "chat.completions",
      style: "legacy",
      url: `${base}/openai/deployments/${deployment}/chat/completions?api-version=${version}`,
    },
    {
      surface: "responses",
      style: "legacy",
      url: `${base}/openai/deployments/${deployment}/responses?api-version=${version}`,
    },
  ];
}

function jsonHint(schema?: AiJsonSchema): string {
  return schema
    ? `\n\nReturn only valid JSON matching this schema:\n${JSON.stringify(schema.schema)}`
    : "";
}

function azurePayload(
  route: { surface: AzureSurface; style: "v1" | "legacy" },
  cfg: { deployment: string },
  options: AiCompleteOptions,
  cap: number,
  dropped: Set<string>
): Record<string, unknown> {
  const prompt = `${options.prompt}${jsonHint(options.jsonSchema)}`;
  const includeModel = route.style === "v1";
  const reasoningDropped = dropped.has("reasoning_effort");
  const schemaDropped = dropped.has("json_schema");

  if (route.surface === "chat.completions") {
    return {
      ...(includeModel ? { model: cfg.deployment } : {}),
      messages: [
        ...(options.system ? [{ role: "system", content: options.system }] : []),
        { role: "user", content: prompt },
      ],
      max_completion_tokens: cap,
      ...(reasoningDropped ? {} : { reasoning_effort: "low" }),
      ...(options.jsonSchema && !schemaDropped
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: options.jsonSchema.name,
                strict: options.jsonSchema.strict ?? true,
                schema: options.jsonSchema.schema,
              },
            },
          }
        : {}),
    };
  }

  return {
    ...(includeModel ? { model: cfg.deployment } : {}),
    ...(options.system ? { instructions: options.system } : {}),
    input: prompt,
    max_output_tokens: cap,
    ...(reasoningDropped ? {} : { reasoning: { effort: "low" } }),
    ...(options.jsonSchema && !schemaDropped
      ? {
          text: {
            format: {
              type: "json_schema",
              name: options.jsonSchema.name,
              strict: options.jsonSchema.strict ?? true,
              schema: options.jsonSchema.schema,
            },
          },
        }
      : {}),
  };
}

function chatText(body: any): string {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === "string" ? part : part?.text || ""))
      .join("");
  }
  return "";
}

function responsesText(body: any): string {
  if (typeof body?.output_text === "string") return body.output_text;
  const output = Array.isArray(body?.output) ? body.output : [];
  return output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("");
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function parseRequiredJson(text: string): unknown {
  try {
    return JSON.parse(stripFences(text));
  } catch {
    throw new ProviderFailure("invalid_json");
  }
}

/** Minimal JSON-schema validation for the structured-output contract. */
function validateSchema(value: unknown, schema: unknown, path = "$"): void {
  if (!schema || typeof schema !== "object") return;
  const s = schema as Record<string, unknown>;
  const type = s.type;
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderFailure("invalid_json");
    const obj = value as Record<string, unknown>;
    const required = Array.isArray(s.required) ? s.required : [];
    for (const key of required) {
      if (!(key in obj)) throw new ProviderFailure("invalid_json");
    }
    const properties = (s.properties && typeof s.properties === "object" ? s.properties : {}) as Record<string, unknown>;
    for (const [key, child] of Object.entries(properties)) {
      if (key in obj) validateSchema(obj[key], child, `${path}.${key}`);
    }
    if (s.additionalProperties === false) {
      for (const key of Object.keys(obj)) if (!(key in properties)) throw new ProviderFailure("invalid_json");
    }
    return;
  }
  if (type === "array") {
    if (!Array.isArray(value)) throw new ProviderFailure("invalid_json");
    if (s.items) for (const item of value) validateSchema(item, s.items, `${path}[]`);
    return;
  }
  if (type === "string" && typeof value !== "string") throw new ProviderFailure("invalid_json");
  if (type === "number" && typeof value !== "number") throw new ProviderFailure("invalid_json");
  if (type === "boolean" && typeof value !== "boolean") throw new ProviderFailure("invalid_json");
}

interface AzureRouteResult {
  text: string;
  json?: unknown;
  incomplete: boolean;
  status: number;
  jsonSchemaWorked: boolean;
  droppedParams: string[];
}

async function callAzureRoute(
  route: { surface: AzureSurface; style: "v1" | "legacy"; url: string },
  cfg: { key: string; deployment: string; apiVersion: string },
  options: AiCompleteOptions,
  cap: number,
  dropped: Set<string>,
  attempts: AiAttempt[]
): Promise<AzureRouteResult> {
  for (let parameterAttempt = 0; parameterAttempt < 3; parameterAttempt++) {
    const payload = azurePayload(route, cfg, options, cap, dropped);
    const started = Date.now();
    let http: HttpResult;
    try {
      http = await requestJson(
        route.url,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "api-key": cfg.key,
          },
          body: JSON.stringify(payload),
        },
        PROVIDER_TIMEOUT_MS
      );
    } catch (err) {
      if (err instanceof ProviderFailure) {
        attempts.push({
          provider: "azure",
          surface: route.surface,
          ok: false,
          errorCode: err.code,
          droppedParams: [...dropped],
          latencyMs: Date.now() - started,
          maxCompletionTokens: cap,
        });
      }
      throw err;
    }

    const attempt: AiAttempt = {
      provider: "azure",
      surface: route.surface,
      status: http.status,
      ok: http.ok,
      droppedParams: [...dropped],
      latencyMs: http.latencyMs,
      maxCompletionTokens: cap,
    };

    if (http.status === 429) {
      const seconds = retryAfterSeconds(http.headers);
      setCooldown(cfg.key, seconds);
      attempts.push({ ...attempt, errorCode: "rate_limited" });
      throw new ProviderFailure("rate_limited", 429, route.surface, seconds, http.bodyText);
    }

    if (http.status === 401) {
      attempts.push({ ...attempt, errorCode: "unauthorized" });
      throw new ProviderFailure("unauthorized", 401, route.surface, undefined, http.bodyText);
    }

    if (http.status >= 500) {
      attempts.push({ ...attempt, errorCode: "server_error" });
      throw new ProviderFailure("server_error", http.status, route.surface, undefined, http.bodyText);
    }

    if (!http.ok) {
      if (http.status === 404 || http.status === 405 || isSurfaceUnavailable(http.bodyText)) {
        attempts.push({ ...attempt, errorCode: "surface_unavailable" });
        throw new ProviderFailure(
          "surface_unavailable",
          http.status,
          route.surface,
          undefined,
          http.bodyText
        );
      }

      if (
        http.status === 400 &&
        !dropped.has("reasoning_effort") &&
        rejectsParam(http.bodyText, ["reasoning_effort", "reasoning effort"])
      ) {
        dropped.add("reasoning_effort");
        attempts.push({ ...attempt, errorCode: "reasoning_effort_rejected" });
        continue;
      }

      if (
        http.status === 400 &&
        options.jsonSchema &&
        !dropped.has("json_schema") &&
        rejectsParam(http.bodyText, ["response_format", "json_schema", "text.format", "text format"])
      ) {
        dropped.add("json_schema");
        attempts.push({ ...attempt, errorCode: "json_schema_rejected" });
        continue;
      }

      attempts.push({ ...attempt, errorCode: errorCode(http.bodyText) });
      throw new ProviderFailure(
        errorCode(http.bodyText),
        http.status,
        route.surface,
        undefined,
        http.bodyText
      );
    }

    let body: any;
    try {
      body = parseBody(http.bodyText, http.status);
    } catch (err) {
      attempts.push({ ...attempt, errorCode: "invalid_json" });
      throw err;
    }

    const text = route.surface === "chat.completions" ? chatText(body) : responsesText(body);
    const incomplete =
      route.surface === "chat.completions"
        ? body?.choices?.[0]?.finish_reason === "length" || !text.trim()
        : body?.status === "incomplete" ||
          body?.incomplete_details?.reason === "max_output_tokens" ||
          !text.trim();

    const schemaWasSent = Boolean(options.jsonSchema && !dropped.has("json_schema"));
    let json: unknown;
    if (options.jsonSchema && text.trim()) {
      try {
        json = parseRequiredJson(text);
        validateSchema(json, options.jsonSchema.schema);
      } catch (err) {
        attempts.push({ ...attempt, errorCode: "invalid_json" });
        throw err;
      }
    }

    attempts.push({
      ...attempt,
      ok: !incomplete,
      errorCode: incomplete ? "incomplete" : undefined,
    });

    return {
      text,
      json,
      incomplete,
      status: http.status,
      jsonSchemaWorked: schemaWasSent && json !== undefined,
      droppedParams: [...dropped],
    };
  }

  throw new ProviderFailure("parameter_rejected", 400);
}

async function callAzure(
  options: AiCompleteOptions,
  attempts: AiAttempt[]
): Promise<ProviderSuccess> {
  const cfg = azureConfig();
  if (!cfg) throw new ProviderFailure("not_configured");

  const cooldown = cooldownSecondsFor(cfg.key);
  if (cooldown > 0) {
    throw new ProviderFailure("cooldown", undefined, undefined, cooldown);
  }

  const initialCap = capFor(options);
  let lastFailure: ProviderFailure | null = null;

  for (const route of azureRoutes(cfg)) {
    const dropped = new Set<string>();
    let cap = initialCap;
    let retriedWithHigherCap = false;

    while (true) {
      let result: AzureRouteResult;
      try {
        result = await callAzureRoute(route, cfg, options, cap, dropped, attempts);
      } catch (err) {
        if (err instanceof ProviderFailure && err.code === "surface_unavailable") {
          lastFailure = err;
          break;
        }
        throw err;
      }

      if (result.incomplete) {
        if (!retriedWithHigherCap) {
          retriedWithHigherCap = true;
          cap = higherCap(cap);
          continue;
        }
        throw new ProviderFailure("incomplete", result.status, route.surface);
      }

      return {
        text: result.text,
        json: result.json,
        provider: "azure",
        model: cfg.deployment,
        surface: route.surface,
        status: result.status,
        droppedParams: result.droppedParams,
        maxCompletionTokens: cap,
        retriedWithHigherCap,
        jsonSchemaWorked: result.jsonSchemaWorked,
      };
    }
  }

  throw (
    lastFailure ||
    new ProviderFailure("surface_unavailable", undefined, undefined, undefined, undefined)
  );
}

function geminiPayload(
  options: AiCompleteOptions,
  cap: number
): Record<string, unknown> {
  const prompt = `${options.prompt}${jsonHint(options.jsonSchema)}`;
  return {
    ...(options.system
      ? { systemInstruction: { parts: [{ text: options.system }] } }
      : {}),
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: cap,
      ...(options.jsonSchema ? { responseMimeType: "application/json" } : {}),
    },
  };
}

async function callGemini(
  options: AiCompleteOptions,
  attempts: AiAttempt[]
): Promise<ProviderSuccess> {
  const cfg = geminiConfig();
  if (!cfg) throw new ProviderFailure("not_configured");

  let cap = capFor(options);
  let retriedWithHigherCap = false;

  while (true) {
    const started = Date.now();
    let http: HttpResult;
    try {
      http = await requestJson(
        `${GEMINI_URL}/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(geminiPayload(options, cap)),
        },
        PROVIDER_TIMEOUT_MS
      );
    } catch (err) {
      if (err instanceof ProviderFailure) {
        attempts.push({
          provider: "gemini",
          ok: false,
          errorCode: err.code,
          droppedParams: [],
          latencyMs: Date.now() - started,
          maxCompletionTokens: cap,
        });
      }
      throw err;
    }

    const attempt: AiAttempt = {
      provider: "gemini",
      status: http.status,
      ok: http.ok,
      droppedParams: [],
      latencyMs: http.latencyMs,
      maxCompletionTokens: cap,
    };

    if (!http.ok) {
      attempts.push({ ...attempt, errorCode: errorCode(http.bodyText) });
      throw new ProviderFailure(
        errorCode(http.bodyText),
        http.status,
        undefined,
        undefined,
        http.bodyText
      );
    }

    let body: any;
    try {
      body = parseBody(http.bodyText, http.status);
    } catch (err) {
      attempts.push({ ...attempt, errorCode: "invalid_json" });
      throw err;
    }

    const candidate = body?.candidates?.[0];
    const text = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("")
      : "";
    const incomplete = candidate?.finishReason === "MAX_TOKENS" || !text.trim();

    if (incomplete) {
      attempts.push({ ...attempt, ok: false, errorCode: "incomplete" });
      if (!retriedWithHigherCap) {
        retriedWithHigherCap = true;
        cap = higherCap(cap);
        continue;
      }
      throw new ProviderFailure("incomplete", http.status);
    }

    let json: unknown;
    if (options.jsonSchema) {
      try {
        json = parseRequiredJson(text);
        validateSchema(json, options.jsonSchema.schema);
      } catch (err) {
        attempts.push({ ...attempt, ok: false, errorCode: "invalid_json" });
        throw err;
      }
    }

    attempts.push({ ...attempt, ok: true });
    return {
      text,
      json,
      provider: "gemini",
      model: cfg.model,
      status: http.status,
      droppedParams: [],
      maxCompletionTokens: cap,
      retriedWithHigherCap,
      jsonSchemaWorked: false,
    };
  }
}

async function callGroq(
  options: AiCompleteOptions,
  attempts: AiAttempt[]
): Promise<ProviderSuccess> {
  const cfg = groqConfig();
  if (!cfg) throw new ProviderFailure("not_configured");

  let cap = capFor(options);
  let retriedWithHigherCap = false;

  while (true) {
    const started = Date.now();
    let http: HttpResult;
    try {
      http = await requestJson(
        GROQ_URL,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${cfg.key}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            messages: [
              ...(options.system ? [{ role: "system", content: options.system }] : []),
              { role: "user", content: `${options.prompt}${jsonHint(options.jsonSchema)}` },
            ],
            max_completion_tokens: cap,
            ...(options.jsonSchema ? { response_format: { type: "json_object" } } : {}),
          }),
        },
        PROVIDER_TIMEOUT_MS
      );
    } catch (err) {
      if (err instanceof ProviderFailure) {
        attempts.push({
          provider: "groq",
          ok: false,
          errorCode: err.code,
          droppedParams: [],
          latencyMs: Date.now() - started,
          maxCompletionTokens: cap,
        });
      }
      throw err;
    }

    const attempt: AiAttempt = {
      provider: "groq",
      status: http.status,
      ok: http.ok,
      droppedParams: [],
      latencyMs: http.latencyMs,
      maxCompletionTokens: cap,
    };

    if (!http.ok) {
      attempts.push({ ...attempt, errorCode: errorCode(http.bodyText) });
      throw new ProviderFailure(
        errorCode(http.bodyText),
        http.status,
        undefined,
        undefined,
        http.bodyText
      );
    }

    let body: any;
    try {
      body = parseBody(http.bodyText, http.status);
    } catch (err) {
      attempts.push({ ...attempt, errorCode: "invalid_json" });
      throw err;
    }

    const choice = body?.choices?.[0];
    const text = typeof choice?.message?.content === "string" ? choice.message.content : "";
    const incomplete = choice?.finish_reason === "length" || !text.trim();

    if (incomplete) {
      attempts.push({ ...attempt, ok: false, errorCode: "incomplete" });
      if (!retriedWithHigherCap) {
        retriedWithHigherCap = true;
        cap = higherCap(cap);
        continue;
      }
      throw new ProviderFailure("incomplete", http.status);
    }

    let json: unknown;
    if (options.jsonSchema) {
      try {
        json = parseRequiredJson(text);
        validateSchema(json, options.jsonSchema.schema);
      } catch (err) {
        attempts.push({ ...attempt, ok: false, errorCode: "invalid_json" });
        throw err;
      }
    }

    attempts.push({ ...attempt, ok: true });
    return {
      text,
      json,
      provider: "groq",
      model: cfg.model,
      status: http.status,
      droppedParams: [],
      maxCompletionTokens: cap,
      retriedWithHigherCap,
      jsonSchemaWorked: false,
    };
  }
}

function expectedAnswer(success: ProviderSuccess, purpose: AiPurpose, attempts: AiAttempt[]): AiAnswer {
  return {
    text: success.text,
    json: success.json,
    provider: success.provider,
    model: success.model,
    cached: false,
    purpose,
    droppedParams: success.droppedParams,
    maxCompletionTokens: success.maxCompletionTokens,
    retriedWithHigherCap: success.retriedWithHigherCap,
    attempts,
  };
}

/**
 * Generate one answer, trying Azure -> Gemini -> Groq -> cache.
 * A cached answer is returned with `cached: true`; the exact answer is preferred
 * and the most recent answer for the same purpose is the last resort.
 */
async function completeAiLegacy(options: AiCompleteOptions): Promise<AiAnswer> {
  if (!options.prompt || !options.prompt.trim()) {
    throw new Error("completeAi requires a non-empty prompt");
  }

  const purpose = purposeOf(options);
  const key = cacheKeyFor(options);
  const attempts: AiAttempt[] = [];

  if (azureConfig()) {
    try {
      const success = await callAzure(options, attempts);
      const answer = expectedAnswer(success, purpose, attempts);
      remember(key, {
        text: answer.text,
        json: answer.json,
        provider: answer.provider,
        model: answer.model,
        purpose,
        storedAt: Date.now(),
      });
      if (answer.droppedParams.length > 0) {
        logger.warn("[ai] Azure accepted the request after dropping parameters", {
          dropped: answer.droppedParams,
        });
      }
      return answer;
    } catch (err) {
      if (err instanceof ProviderFailure && err.code !== "not_configured") {
        logger.warn("[ai] Azure failed; falling through", {
          code: err.code,
          status: err.status ?? null,
          cooldownSeconds: err.retryAfterSeconds ?? null,
        });
      } else if (!(err instanceof ProviderFailure)) {
        logger.warn("[ai] Azure failed with an unexpected error; falling through");
      }
    }
  } else {
    attempts.push({
      provider: "azure",
      ok: false,
      errorCode: "not_configured",
      droppedParams: [],
      latencyMs: 0,
    });
  }

  if (geminiConfig()) {
    try {
      const success = await callGemini(options, attempts);
      const answer = expectedAnswer(success, purpose, attempts);
      remember(key, {
        text: answer.text,
        json: answer.json,
        provider: answer.provider,
        model: answer.model,
        purpose,
        storedAt: Date.now(),
      });
      return answer;
    } catch (err) {
      logger.warn("[ai] Gemini failed; falling through", {
        code: err instanceof ProviderFailure ? err.code : "unexpected",
        status: err instanceof ProviderFailure ? err.status ?? null : null,
      });
    }
  } else {
    attempts.push({
      provider: "gemini",
      ok: false,
      errorCode: "not_configured",
      droppedParams: [],
      latencyMs: 0,
    });
  }

  if (groqConfig()) {
    try {
      const success = await callGroq(options, attempts);
      const answer = expectedAnswer(success, purpose, attempts);
      remember(key, {
        text: answer.text,
        json: answer.json,
        provider: answer.provider,
        model: answer.model,
        purpose,
        storedAt: Date.now(),
      });
      return answer;
    } catch (err) {
      logger.warn("[ai] Groq failed; falling through to cache", {
        code: err instanceof ProviderFailure ? err.code : "unexpected",
        status: err instanceof ProviderFailure ? err.status ?? null : null,
      });
    }
  } else {
    attempts.push({
      provider: "groq",
      ok: false,
      errorCode: "not_configured",
      droppedParams: [],
      latencyMs: 0,
    });
  }

  const cached = cachedAnswer(key, purpose);
  if (cached) {
    return {
      text: cached.text,
      json: cached.json,
      provider: "cache",
      model: cached.model,
      cached: true,
      purpose,
      droppedParams: [],
      maxCompletionTokens: capFor(options),
      retriedWithHigherCap: false,
      attempts,
    };
  }

  throw new AiUnavailableError(attempts);
}

/**
 * Azure -> Groq -> Gemini -> last known answer. A provider that just failed
 * (timeout, 5xx, 429, invalid schema) is skipped for 60 seconds by the circuit
 * breaker; a successful call closes it again.
 */
export async function completeAi(options: AiCompleteOptions): Promise<AiAnswer> {
  if (!options.prompt || !options.prompt.trim()) {
    throw new Error("completeAi requires a non-empty prompt");
  }

  const purpose = purposeOf(options);
  const key = cacheKeyFor(options);
  const attempts: AiAttempt[] = [];
  const chain: Array<{
    name: "azure" | "groq" | "gemini";
    configured: boolean;
    call: (options: AiCompleteOptions, attempts: AiAttempt[]) => Promise<ProviderSuccess>;
  }> = [
    { name: "azure", configured: Boolean(azureConfig()), call: callAzure },
    { name: "groq", configured: Boolean(groqConfig()), call: callGroq },
    { name: "gemini", configured: Boolean(geminiConfig()), call: callGemini },
  ];

  for (const item of chain) {
    if (!item.configured) {
      attempts.push({ provider: item.name, ok: false, errorCode: "not_configured", droppedParams: [], latencyMs: 0 });
      continue;
    }

    const cooldown = providerCooldownSeconds(item.name);
    if (cooldown > 0) {
      attempts.push({ provider: item.name, ok: false, errorCode: "cooldown", droppedParams: [], latencyMs: 0 });
      continue;
    }

    try {
      const success = await item.call(options, attempts);
      clearProviderCircuit(item.name);
      const answer = expectedAnswer(success, purpose, attempts);
      remember(key, {
        text: answer.text,
        json: answer.json,
        provider: answer.provider,
        model: answer.model,
        purpose,
        storedAt: Date.now(),
      });
      if (answer.droppedParams.length > 0) {
        logger.warn("[ai] provider accepted the request after dropping parameters", { dropped: answer.droppedParams });
      }
      return answer;
    } catch (err) {
      if (err instanceof ProviderFailure) {
        if (err.code !== "not_configured") openProviderCircuit(item.name);
        logger.warn("[ai] provider failed; trying the next", {
          provider: item.name,
          code: err.code,
          status: err.status ?? null,
        });
      } else {
        openProviderCircuit(item.name);
        logger.warn("[ai] provider failed with an unexpected error; trying the next", { provider: item.name });
      }
    }
  }

  const cached = cachedAnswer(key, purpose);
  if (cached) {
    return {
      text: cached.text,
      json: cached.json,
      provider: "cache",
      model: cached.model,
      cached: true,
      purpose,
      droppedParams: [],
      maxCompletionTokens: capFor(options),
      retriedWithHigherCap: false,
      attempts,
    };
  }

  throw new AiUnavailableError(attempts);
}

function attemptDropped(attempts: AiAttempt[]): string[] {
  return [...new Set(attempts.flatMap((attempt) => attempt.droppedParams))];
}

/**
 * One tiny Azure probe for boot diagnostics. It asks for a two-field JSON
 * object so the report can say whether schema-constrained output actually
 * works, not merely whether the key authenticates.
 */
export async function probeAzure(): Promise<AzureProbeReport> {
  const cfg = azureConfig();
  if (!cfg) {
    return {
      configured: false,
      status: null,
      surface: null,
      jsonSchema: null,
      droppedParams: [],
      latencyMs: 0,
      cooldownSeconds: null,
    };
  }

  const started = Date.now();
  const attempts: AiAttempt[] = [];
  try {
    const result = await callAzure(
      {
        prompt: PROBE_PROMPT,
        system: "You are a health probe. Return only the requested JSON object.",
        purpose: "chat",
        jsonSchema: PROBE_SCHEMA,
        maxCompletionTokens: 64,
      },
      attempts
    );
    return {
      configured: true,
      status: result.status ?? null,
      surface: result.surface ?? null,
      jsonSchema: result.jsonSchemaWorked,
      droppedParams: result.droppedParams,
      latencyMs: Date.now() - started,
      cooldownSeconds: cooldownSecondsFor(cfg.key) || null,
    };
  } catch (err) {
    const failure = err instanceof ProviderFailure ? err : null;
    const lastAttempt = [...attempts].reverse().find((attempt) => attempt.status !== undefined);
    return {
      configured: true,
      status: failure?.status ?? lastAttempt?.status ?? null,
      surface: failure?.surface ?? lastAttempt?.surface ?? null,
      jsonSchema: false,
      droppedParams: attemptDropped(attempts),
      errorCode: failure?.code ?? "unexpected",
      latencyMs: Date.now() - started,
      cooldownSeconds:
        failure?.retryAfterSeconds ?? (cooldownSecondsFor(cfg.key) || null),
    };
  }
}

export async function runAzureStartupProbe(): Promise<AzureProbeReport> {
  const report = await probeAzure();
  if (!report.configured) {
    logger.warn(
      "[ai] Azure startup probe skipped: AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT are not all set"
    );
    return report;
  }

  const dropped = report.droppedParams.length > 0 ? report.droppedParams.join(",") : "none";
  const line =
    `[ai] Azure startup probe status=${report.status ?? "timeout"} ` +
    `surface=${report.surface ?? "none"} jsonSchema=${report.jsonSchema} ` +
    `dropped=${dropped} latencyMs=${report.latencyMs}`;
  if (report.errorCode) {
    logger.warn(`${line} error=${report.errorCode}`);
  } else {
    logger.info(line);
  }
  return report;
}

/** Exported only for tests: clears cache and cooldown state between cases. */
export function __resetAiProviderForTests(): void {
  cache.clear();
  lastByPurpose.clear();
  azureCooldownUntil.clear();
  providerCooldownUntil.clear();
}
