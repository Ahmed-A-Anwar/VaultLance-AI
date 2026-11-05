import { describe, expect, it } from "vitest";
import { EVENT_TYPE_MAP, toUiEvent, sortEvents } from "./eventAdapter";

const row = {
  id: "e1",
  vault_id: "v1",
  actor_id: "u1",
  event_type: "FUNDS_AUTHORIZED",
  amount: 180,
  currency: "USD",
  metadata: { note: "Funds authorized, held in escrow", paypalId: "8XK19304AB557210H" },
  created_at: "2026-11-03T09:15:00.000Z",
};

describe("eventAdapter", () => {
  it("maps every client event type", () => {
    expect(Object.keys(EVENT_TYPE_MAP).sort()).toEqual([
      "AUDIT_COMPLETED",
      "FILES_UNLOCKED",
      "FUNDS_AUTHORIZED",
      "PAYMENT_CAPTURED",
      "VAULT_CANCELLED",
    ]);
  });

  it("maps a row onto a UI event with cents and a date", () => {
    const e = toUiEvent(row);
    expect(e).toEqual({
      id: "e1",
      type: "PAYMENT.AUTHORIZED",
      vaultId: "v1",
      label: "Funds authorized, held in escrow",
      amountCents: 18_000,
      ts: Date.parse("2026-11-03T09:15:00.000Z"),
      paypalId: "8XK19304AB557210H",
    });
  });

  it("drops rows the client views have no place for", () => {
    for (const type of ["PAYOUT.SENT", "VAULT_CREATED", "MANIFEST.LOCKED", "", "UNKNOWN"]) {
      expect(toUiEvent({ ...row, event_type: type })).toBeNull();
    }
    expect(toUiEvent({ ...row, id: "" })).toBeNull();
    expect(toUiEvent(null)).toBeNull();
  });

  it("never invents a date or an amount", () => {
    const e = toUiEvent({ ...row, created_at: "garbage", amount: null, metadata: {} });
    expect(e?.ts).toBeUndefined();
    expect(e?.amountCents).toBeUndefined();
    expect(e?.paypalId).toBeUndefined();
    expect(e?.label).toBe("FUNDS_AUTHORIZED");
  });

  it("leaves zero amounts off the row and sorts undated rows last", () => {
    expect(toUiEvent({ ...row, amount: 0 })?.amountCents).toBeUndefined();
    const sorted = sortEvents([
      { id: "a", type: "PAYMENT.CAPTURED", vaultId: "v", label: "a", ts: 10 },
      { id: "b", type: "PAYMENT.CAPTURED", vaultId: "v", label: "b" },
      { id: "c", type: "PAYMENT.CAPTURED", vaultId: "v", label: "c", ts: 30 },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });
});
