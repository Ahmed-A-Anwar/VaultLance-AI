import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approvalFromUrl,
  cleanPaypalQuery,
  forgetApprovedOrder,
  pendingApprovalFor,
  rememberApprovedOrder,
} from "./paypalReturn";

/* the module reads window at call time, so a stub is enough */
function fakeWindow() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    localStorage,
    history: { replaceState },
    location: { origin: "https://app.test", search: "?status=authorized&token=4X2432698G033250X" },
  });
  return { store, replaceState };
}

afterEach(() => vi.unstubAllGlobals());

describe("paypal return", () => {
  it("reads the vault and the order out of PayPal's redirect", () => {
    fakeWindow();
    expect(
      approvalFromUrl("https://app.test/vault/306ebb44-01d8-471b?status=authorized&token=4X2432698G033250X&PayerID=6KH")
    ).toEqual({ vaultId: "306ebb44-01d8-471b", orderId: "4X2432698G033250X" });
  });

  it("honours a bare token and ignores a status that is not an approval", () => {
    fakeWindow();
    expect(approvalFromUrl("/vault/v1?token=ORD")?.orderId).toBe("ORD");
    expect(approvalFromUrl("/vault/v1?status=cancelled&token=ORD")).toBeNull();
    /* a token that did not arrive on a vault path is not an approval we can place */
    expect(approvalFromUrl("/dashboard?status=authorized&token=ORD")).toBeNull();
  });

  it("keeps one approval per vault, newest wins, and forgets it when finished", () => {
    const { store } = fakeWindow();
    rememberApprovedOrder("v1", "ORD1");
    rememberApprovedOrder("v1", "ORD2");
    rememberApprovedOrder("v2", "ORD3");

    expect(pendingApprovalFor("v1")?.orderId).toBe("ORD2");
    forgetApprovedOrder("v1");
    expect(pendingApprovalFor("v1")).toBeNull();
    expect(pendingApprovalFor("v2")?.orderId).toBe("ORD3");
    expect(store.size).toBe(1);
  });

  it("drops PayPal's query string and keeps the path", () => {
    const { replaceState } = fakeWindow();
    cleanPaypalQuery("v1");
    expect(replaceState.mock.calls[0]?.[2]).toBe("/vault/v1");
  });
});
