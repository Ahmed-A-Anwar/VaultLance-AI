import { describe, it, expect, beforeEach, vi } from "vitest";

const supa = vi.hoisted(() => ({ error: null as null | { message: string } }));

vi.mock("../src/shared/supabaseClient.js", () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    from: () => ({
      update: () => ({
        eq: async () => ({ error: supa.error }),
      }),
    }),
  },
}));

const store = await import("../src/money/money.store.js");

describe("B3 – PayPal id writes fail loudly", () => {
  beforeEach(() => {
    supa.error = null;
  });

  it("resolves when the row accepts the id", async () => {
    await expect(store.rememberOrder("vault-ok", "ORDER-OK")).resolves.toBeUndefined();
    await expect(store.rememberAuthorization("vault-ok", "AUTH-OK")).resolves.toBeUndefined();
    await expect(store.rememberCapture("vault-ok", "CAP-OK")).resolves.toBeUndefined();
  });

  it("throws MONEY_WRITE_FAILED when the database refuses the update", async () => {
    supa.error = { message: "permission denied" };

    await expect(store.rememberOrder("vault-bad", "ORDER-1")).rejects.toMatchObject({
      code: "MONEY_WRITE_FAILED",
    });
    await expect(store.rememberAuthorization("vault-bad", "AUTH-1")).rejects.toMatchObject({
      code: "MONEY_WRITE_FAILED",
    });
    await expect(store.rememberCapture("vault-bad", "CAP-1")).rejects.toMatchObject({
      code: "MONEY_WRITE_FAILED",
    });
  });
});
