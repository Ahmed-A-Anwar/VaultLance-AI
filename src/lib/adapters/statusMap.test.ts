import { describe, expect, it, vi } from "vitest";
import { STATUS_MAP, resetStatusWarnings, uiPayoutStatusOf, uiStatusOf } from "./statusMap";

describe("statusMap", () => {
  it("maps all fourteen backend states to one of the five UI statuses", () => {
    expect(STATUS_MAP).toEqual({
      DRAFT: "awaiting_payment",
      AWAITING_CLIENT: "awaiting_payment",
      AWAITING_AUTHORIZATION: "awaiting_payment",
      AUTHORIZED: "held",
      IN_PROGRESS: "held",
      SUBMITTED: "audited",
      VERIFYING: "audited",
      NEEDS_REVISION: "audited",
      AWAITING_APPROVAL: "audited",
      CAPTURE_PENDING: "audited",
      PAID: "unlocked",
      CANCELLED: "voided",
      EXPIRED: "voided",
      DISPUTED: "voided",
    });
  });

  it("reads every key back, whatever the case or padding", () => {
    for (const key of Object.keys(STATUS_MAP)) {
      expect(uiStatusOf(key)).toBe(STATUS_MAP[key as keyof typeof STATUS_MAP]);
      expect(uiStatusOf(` ${key.toLowerCase()} `)).toBe(STATUS_MAP[key as keyof typeof STATUS_MAP]);
    }
  });

  it("never unlocks a capture that has not landed", () => {
    expect(uiStatusOf("CAPTURE_PENDING")).toBe("audited");
    expect(uiStatusOf("PAID")).toBe("unlocked");
  });

  it("renders an unknown state as voided and warns exactly once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resetStatusWarnings();

    expect(uiStatusOf("MADE_UP_STATE")).toBe("voided");
    expect(uiStatusOf("MADE_UP_STATE")).toBe("voided");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("MADE_UP_STATE");

    warn.mockRestore();
  });

  it("treats a missing or non-string status as voided", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resetStatusWarnings();
    expect(uiStatusOf(undefined)).toBe("voided");
    expect(uiStatusOf(null)).toBe("voided");
    expect(uiStatusOf(42)).toBe("voided");
    warn.mockRestore();
  });

  it("maps payout statuses, with blocked reading as failed", () => {
    expect(uiPayoutStatusOf("pending")).toBe("pending");
    expect(uiPayoutStatusOf("creating")).toBe("pending");
    expect(uiPayoutStatusOf("none")).toBe("pending");
    expect(uiPayoutStatusOf("paid")).toBe("paid");
    expect(uiPayoutStatusOf("failed")).toBe("failed");
    expect(uiPayoutStatusOf("blocked")).toBe("failed");
    expect(uiPayoutStatusOf("PAID")).toBe("paid");
    expect(uiPayoutStatusOf("whatever")).toBeUndefined();
    expect(uiPayoutStatusOf(undefined)).toBeUndefined();
  });
});
