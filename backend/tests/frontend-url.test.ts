/**
 * The PayPal return must land on the origin that holds the session. These cases
 * are the ones that produced /signin after a successful approval: the loopback
 * fallback, and an origin the browser actually used.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { frontendBaseUrl, isAllowedOrigin } from "../src/shared/frontend.url.js";

afterEach(() => vi.unstubAllEnvs());

describe("frontendBaseUrl", () => {
  it("returns the origin that started the payment when it is allowed", () => {
    vi.stubEnv("FRONTEND_ORIGINS", "https://vault-lance-ai.vercel.app,http://localhost:5173");
    expect(frontendBaseUrl("http://localhost:5173")).toBe("http://localhost:5173");
    expect(frontendBaseUrl("https://vault-lance-ai.vercel.app")).toBe(
      "https://vault-lance-ai.vercel.app"
    );
  });

  it("ignores an origin that is not allowed", () => {
    vi.stubEnv("FRONTEND_ORIGINS", "https://vault-lance-ai.vercel.app");
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(frontendBaseUrl("https://evil.example")).toBe("https://vault-lance-ai.vercel.app");
  });

  it("falls back to the configured frontend, without a trailing slash", () => {
    vi.stubEnv("FRONTEND_URL", "https://vault-lance-ai.vercel.app/");
    expect(frontendBaseUrl(undefined)).toBe("https://vault-lance-ai.vercel.app");
  });
});
