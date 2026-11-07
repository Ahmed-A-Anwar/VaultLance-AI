import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureHttp, setAccessToken } from "./http";
import { login, register } from "./authApi";
import { realOverride } from "../config/fx";

/* http.ts times out with window.setTimeout, which a node test env lacks */
beforeEach(() => {
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
  });
  configureHttp("http://api.test/api");
  realOverride.auth = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setAccessToken(null);
  delete realOverride.auth;
});

/* A request that never answers, recording the moment the browser gives up. */
function hangingFetch(aborted: boolean[]) {
  return vi.fn(
    (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        (init?.signal as AbortSignal).addEventListener("abort", () => {
          aborted.push(true);
          reject(new Error("aborted"));
        });
      })
  );
}

describe("auth cold start", () => {
  it("gives registration 45s before the browser aborts it", async () => {
    vi.useFakeTimers();
    const aborted: boolean[] = [];
    vi.stubGlobal("fetch", hangingFetch(aborted));

    const call = register({
      email: "e2e-cold@example.com",
      password: "Vp-LongEnough123!",
      fullName: "Eve Cold",
      role: "FREELANCER",
    });
    const rejected = expect(call).rejects.toThrow(/too long/);

    /* the old 10s deadline would already have fired here */
    await vi.advanceTimersByTimeAsync(20_000);
    expect(aborted).toEqual([]);

    await vi.advanceTimersByTimeAsync(25_100);
    await rejected;
    expect(aborted).toEqual([true]);
  });

  it("keeps the same deadline on sign-in", async () => {
    vi.useFakeTimers();
    const aborted: boolean[] = [];
    vi.stubGlobal("fetch", hangingFetch(aborted));

    const call = login("e2e-cold@example.com", "Vp-LongEnough123!");
    const rejected = expect(call).rejects.toThrow(/too long/);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(aborted).toEqual([]);

    await vi.advanceTimersByTimeAsync(25_100);
    await rejected;
    expect(aborted).toEqual([true]);
  });
});
