/* payments.spec.ts — the transforms behind the Payments page. Pure values over
   the seed: the fee split, the receipt kinds, and the hold clock. */

import { test, expect } from "@playwright/test";
import { freelancerPayoutEstimate, paypalFeeEstimate, vaultlanceFee } from "../src/lib/fees";
import { paidOut, heldTotal } from "../src/lib/earnings";
import {
  FAILURE_REASON,
  HOLD_DAYS,
  daysLeft,
  holdsFrom,
  payoutsFrom,
  receiptsFrom,
} from "../src/components/payments/paymentsModel";
import type { FreelancerEvent, FreelancerVault } from "../src/components/freelancer/mockApi";
import type { LedgerEvent, Vault } from "../src/lib/api";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-04T12:00:00Z");

const vault = (patch: Partial<FreelancerVault> & { id: string }): FreelancerVault =>
  ({
    project: `Project ${patch.id}`,
    clientName: "Ahmed",
    clientEmail: "ahmed@northlight.co",
    amountCents: 10_000,
    uiStatus: "unlocked",
    kind: "design",
    filesCount: 0,
    files: [],
    createdAt: NOW - 9 * DAY,
    ...patch,
  }) as FreelancerVault;

const event = (
  id: string,
  vaultId: string,
  type: FreelancerEvent["type"],
  at: string,
  amountCents?: number
): FreelancerEvent =>
  ({ id, at, type, vaultId, vaultProject: `Project ${vaultId}`, amountCents }) as FreelancerEvent;

/* the six seeded vaults, only the ones with a payout status matter here */
const SEED: FreelancerVault[] = [
  vault({ id: "v_0001", project: "Icon Set", amountCents: 12_000, payoutStatus: "failed", payoutPaypalId: "8XK12345AB678901C" }),
  vault({ id: "v_0002", project: "Logo Pack", amountCents: 18_000, uiStatus: "held" }),
  vault({ id: "v_0003", project: "Pitch Deck", amountCents: 45_000, uiStatus: "awaiting_payment" }),
  vault({ id: "v_0004", project: "Landing Page", amountCents: 30_000, uiStatus: "awaiting_payment" }),
  vault({ id: "v_0005", project: "Booking Web App", amountCents: 240_000, uiStatus: "audited" }),
  vault({ id: "v_0006", project: "Brand Guide", amountCents: 9_000, payoutStatus: "paid", payoutPaypalId: "8XK98765ZY432109D" }),
];

const EVENTS: FreelancerEvent[] = [
  event("e_01", "v_0006", "PAYMENT.CAPTURED", "2026-10-26T10:00:00Z", 9_000),
  event("e_03", "v_0006", "PAYOUT.SENT", "2026-10-26T22:27:00Z", 8_034),
  event("e_04", "v_0001", "PAYOUT.FAILED", "2026-10-28T09:00:00Z", 12_000),
];

test.describe("payouts", () => {
  test("one row per vault with a payout status, newest first", () => {
    const rows = payoutsFrom(SEED, EVENTS);
    expect(rows.map((r) => r.vaultId)).toEqual(["v_0001", "v_0006"]);
  });

  test("the split adds up: gross minus both fees is net", () => {
    const [iconSet, brandGuide] = payoutsFrom(SEED, EVENTS).sort((a, b) => a.vaultId.localeCompare(b.vaultId));

    expect(brandGuide.status).toBe("paid");
    expect(brandGuide.grossCents).toBe(9_000);
    expect(brandGuide.vaultlanceFeeCents).toBe(450);
    expect(brandGuide.paypalFeeCents).toBe(516);
    expect(brandGuide.netCents).toBe(8_034);
    expect(brandGuide.grossCents - brandGuide.vaultlanceFeeCents - brandGuide.paypalFeeCents).toBe(
      brandGuide.netCents
    );
    expect(brandGuide.paypalPayoutId).toBe("8XK98765ZY432109D");
    expect(brandGuide.paidAt).toBe(Date.parse("2026-10-26T22:27:00Z"));

    expect(iconSet.status).toBe("failed");
    expect(iconSet.failureReason).toBe(FAILURE_REASON);
    expect(iconSet.paidAt).toBeUndefined();
    expect(iconSet.netCents).toBe(10_722);
  });

  test("the fees come from lib/fees, not from this module", () => {
    for (const row of payoutsFrom(SEED, EVENTS)) {
      expect(row.vaultlanceFeeCents).toBe(vaultlanceFee(row.grossCents));
      expect(row.paypalFeeCents).toBe(paypalFeeEstimate(row.grossCents));
      expect(row.netCents).toBe(freelancerPayoutEstimate(row.grossCents));
    }
  });

  test("paid nets equal the shared paid total", () => {
    const paid = payoutsFrom(SEED, EVENTS).filter((r) => r.status === "paid");
    expect(paid.reduce((sum, r) => sum + r.netCents, 0)).toBe(paidOut(SEED));
    expect(paidOut(SEED)).toBe(8_034);
  });

  test("a pending payout is neither paid nor failed", () => {
    const rows = payoutsFrom([vault({ id: "p1", payoutStatus: "pending", amountCents: 5_000 })], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].paidAt).toBeUndefined();
    expect(rows[0].failureReason).toBeUndefined();
  });
});

const clientVault = (patch: Partial<Vault> & { id: string }): Vault => ({
  project: `Project ${patch.id}`,
  freelancer: "Maya",
  amountUSD: 100,
  status: "held",
  createdAt: NOW - DAY,
  ...patch,
});

const clientEvent = (
  id: string,
  vaultId: string,
  type: LedgerEvent["type"],
  ts: number,
  amountUSD: number,
  paypalId?: string
): LedgerEvent => ({ id, ts, type, vaultId, label: "seeded", amountUSD, paypalId });

test.describe("receipts", () => {
  const vaults = [
    clientVault({ id: "v_logo_pack", project: "Logo Pack", amountUSD: 180, status: "held" }),
    clientVault({ id: "v_brand_guide", project: "Brand Guide", amountUSD: 90, status: "unlocked" }),
  ];
  const events = [
    clientEvent("e1", "v_brand_guide", "PAYMENT.CAPTURED", NOW - 3 * DAY, 90, "8XK54017CD884039M"),
    clientEvent("e2", "v_booking_app", "PAYMENT.VOIDED", NOW - 36 * 60 * 60 * 1000, 2400, "8XK77120EF901774B"),
    clientEvent("e3", "v_logo_pack", "PAYMENT.AUTHORIZED", NOW - 2 * 60 * 60 * 1000, 180),
  ];

  test("only captures and voids are receipts", () => {
    const rows = receiptsFrom(vaults, events);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.kind).sort()).toEqual(["capture", "void"]);
  });

  test("amounts are exact cents and the project is joined from the vault", () => {
    const [voided, captured] = receiptsFrom(vaults, events);
    expect(voided.amountCents).toBe(240_000);
    /* the void's vault is not in this fixture, so the ledger label stands in */
    expect(voided.project).toBe("seeded");
    expect(captured.amountCents).toBe(9_000);
    expect(captured.project).toBe("Brand Guide");
    expect(captured.paypalId).toBe("8XK54017CD884039M");
  });
});

test.describe("holds", () => {
  const vaults = [
    clientVault({ id: "v_logo_pack", project: "Logo Pack", amountUSD: 180, status: "held" }),
    clientVault({ id: "v_booking_app", project: "Booking Web App", amountUSD: 2400, status: "audited" }),
    clientVault({ id: "v_brand_guide", project: "Brand Guide", amountUSD: 90, status: "unlocked" }),
    clientVault({ id: "v_landing_page", project: "Landing Page", amountUSD: 300, status: "awaiting_payment" }),
  ];

  test("held and audited vaults are held; captured and unauthorized are not", () => {
    const holds = holdsFrom(vaults, []);
    expect(holds.map((h) => h.vaultId).sort()).toEqual(["v_booking_app", "v_logo_pack"]);
    expect(heldTotal(vaults)).toBe(258_000);
  });

  test("the clock starts at the latest authorization", () => {
    const authorizedAt = NOW - 30 * 60 * 60 * 1000;
    const holds = holdsFrom(vaults, [
      clientEvent("a1", "v_booking_app", "PAYMENT.VOIDED", NOW - 36 * 60 * 60 * 1000, 2400),
      clientEvent("a2", "v_booking_app", "PAYMENT.AUTHORIZED", authorizedAt, 2400),
    ]);
    const booking = holds.find((h) => h.vaultId === "v_booking_app")!;
    expect(booking.authorizedAt).toBe(authorizedAt);
    expect(booking.expiresAt).toBe(authorizedAt + HOLD_DAYS * DAY);
    expect(daysLeft(booking, NOW)).toBe(28);
  });

  test("a hold that has run out reads zero, never negative", () => {
    const stale = { vaultId: "x", project: "X", amountCents: 100, authorizedAt: 0, expiresAt: NOW - DAY };
    expect(daysLeft(stale, NOW)).toBe(0);
  });
});
