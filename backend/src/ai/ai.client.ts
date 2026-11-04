/**
 * ai.client.ts — the only way the API talks to the AI engine.
 *
 * Private networking (vaultlance-ai-engine.internal:8000), the shared internal
 * key, and a 20s ceiling. A failure is turned into a clear 502/504 instead of
 * a request that hangs until the platform kills it.
 */
import { AppError } from "../shared/errors.js";

const TIMEOUT_MS = 20_000;

export const aiServiceUrl = (): string =>
  process.env.AI_SERVICE_URL || "http://vaultlance-ai-engine.internal:8000";

export async function callAiService<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) {
    throw new AppError("INTERNAL_API_KEY is not configured on the API.", 500, "AI_NOT_CONFIGURED");
  }

  let response: Response;
  try {
    response = await fetch(`${aiServiceUrl()}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-internal-key": key,
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new AppError("The AI service did not answer within 20 seconds.", 504, "AI_TIMEOUT");
    }
    throw new AppError("The AI service is unreachable.", 502, "AI_UNREACHABLE");
  }

  if (!response.ok) {
    throw new AppError(`The AI service answered ${response.status}.`, 502, "AI_UPSTREAM_ERROR");
  }

  return (await response.json()) as T;
}
