/* earnings.spec.ts — the selectors behind the Earnings page and the Overview's
   PAID OUT tile. Pure values only: month boundaries, failed payouts, and the
   pending-versus-escrow split. */

import { test, expect } from "@playwright/test";
import {
  allTimePaidCents,
  buildEarningsRows,
  capturedTotal,
  clientPaymentsSummary,
  csvCell,
  earningsSummary,
  failedPayouts,
  filterRows,
  heldTotal,
  inEscrow,
  inEscrowCents,
  paidAtOf,
  paidOut,
  paidPayouts,
  paymentsSummary,
  pendingPayout,
  pendingPayoutCents,
  thisMonthPaidCents,
  toCsv,
  totalPaidCents,
  voidedTotal,
} from "../src/lib/earnings";
import { freelancerPayoutEstimate } from "../src/lib/fees";

type V = Parameters<typeof allTimePaidCents>[0][number];
type E = NonNullable<Parameters<typeof allTimePaidCents>[1]>[number];

/* a calendar month is the viewer's local month, so the fixtures are built in
   local time and the boundary is the same boundary the user's clock shows */
const NOW = new Date(2026, 10, 15, 12, 0, 0);

const vault = (patch: Partial<V> & { id: string }): V =>
  ({
    project: `Project ${patch.id}`,
    clientName: "Ahmed",
    clientEmail: "ahmed@northlight.co",
    amountCents: 10_000,
    uiStatus: "unlocked",
    kind: "design",
    filesCount: 1,
    files: [],
    createdAt: 0,
    ...patch,
  }) as V;

const payout = (id: string, vaultId: string, at: string, amountCents = 8_000): E =>
  ({
    id,
    at,
    type: "PAYOUT.SENT",
    vaultId,
    vaultProject: `Project ${vaultId}`,
    amountCents,
  }) as E;

test.describe("paid payouts", () => {
  test("only a paid payout counts, and its date comes from PAYOUT.SENT", () => {
    const paid = vault({ id: "v1", payoutStatus: "paid", payoutPaypalId: "8XK1" });
    const failed = vault({ id: "v2", payoutStatus: "failed" });
    const pending = vault({ id: "v3", payoutStatus: "pending" });
    const events = [payout("e1", "v1", "2026-11-02T09:00:00Z")];

    const rows = paidPayouts([paid, failed, pending], events);
    expect(rows).toHaveLength(1);
    expect(rows[0].vaultId).toBe("v1");
    expect(rows[0].amountCents).toBe(freelancerPayoutEstimate(10_000));
    expect(rows[0].paidAt).toBe(Date.parse("2026-11-02T09:00:00Z"));
    expect(allTimePaidCents([paid, failed, pending], events)).toBe(freelancerPayoutEstimate(10_000));
  });

  test("the latest PAYOUT.SENT wins when a retry added a second one", () => {
    const paid = vault({ id: "v1", payoutStatus: "paid" });
    const events = [
      payout("e1", "v1", "2026-10-01T09:00:00Z"),
      payout("e2", "v1", "2026-11-03T09:00:00Z"),
    ];
    expect(paidAtOf(paid, events)).toBe(Date.parse("2026-11-03T09:00:00Z"));
  });

  test("a paid vault with no payout event falls back to its last event date", () => {
    const paid = vault({ id: "v1", payoutStatus: "paid", lastEventAt: 1_700_000_000_000 });
    expect(paidAtOf(paid, [])).toBe(1_700_000_000_000);
  });
});

test.describe("this month", () => {
  const paid = (id: string, lastEventAt: number) =>
    vault({ id, payoutStatus: "paid", lastEventAt });

  test("includes a payout on the first minute of the month", () => {
    const at = new Date(2026, 10, 1, 0, 0, 0, 0).getTime();
    expect(thisMonthPaidCents([paid("v1", at)], [], NOW)).toBe(freelancerPayoutEstimate(10_000));
  });

  test("excludes a payout on the last minute of the previous month", () => {
    const at = new Date(2026, 9, 31, 23, 59, 0, 0).getTime();
    expect(thisMonthPaidCents([paid("v1", at)], [], NOW)).toBe(0);
  });

  test("excludes the same month a year earlier", () => {
    const at = new Date(2025, 10, 5, 10, 0, 0).getTime();
    expect(thisMonthPaidCents([paid("v1", at)], [], NOW)).toBe(0);
  });

  test("uses the payout event's date, not the vault's last event", () => {
    const v = vault({
      id: "v1",
      payoutStatus: "paid",
      lastEventAt: Date.parse("2026-11-10T00:00:00Z"),
    });
    const events = [payout("e1", "v1", new Date(2026, 9, 10, 0, 0, 0).toISOString())];
    expect(thisMonthPaidCents([v], events, NOW)).toBe(0);
  });

  test("a failed payout is never this month's earnings", () => {
    const v = vault({ id: "v1", payoutStatus: "failed", lastEventAt: NOW.getTime() });
    expect(thisMonthPaidCents([v], [], NOW)).toBe(0);
  });
});

test.describe("pending versus escrow", () => {
  test("captured money is pending, held money is escrow, and they never overlap", () => {
    const captured = vault({ id: "v1", uiStatus: "unlocked", payoutStatus: "pending" });
    const funded = vault({ id: "v2", uiStatus: "held", invitedAt: 1 });
    const audited = vault({ id: "v3", uiStatus: "audited", submittedAt: 1 });
    const failed = vault({ id: "v4", uiStatus: "unlocked", payoutStatus: "failed" });

    expect(pendingPayoutCents([captured, funded, audited, failed])).toBe(
      freelancerPayoutEstimate(10_000)
    );
    expect(inEscrowCents([captured, funded, audited, failed])).toBe(
      freelancerPayoutEstimate(10_000) * 2
    );
    expect(failedPayouts([captured, funded, audited, failed])).toEqual([
      { vaultId: "v4", project: "Project v4", estimateCents: freelancerPayoutEstimate(10_000) },
    ]);
  });

  test("the summary adds up to its parts", () => {
    const vaults = [
      vault({ id: "v1", payoutStatus: "paid", lastEventAt: NOW.getTime() }),
      vault({ id: "v2", payoutStatus: "paid", lastEventAt: Date.parse("2026-10-02T00:00:00Z") }),
      vault({ id: "v3", uiStatus: "unlocked", payoutStatus: "pending" }),
      vault({ id: "v4", uiStatus: "audited", submittedAt: 1 }),
      vault({ id: "v5", uiStatus: "unlocked", payoutStatus: "failed" }),
    ];
    const s = earningsSummary(vaults, [], NOW);
    const est = freelancerPayoutEstimate(10_000);
    expect(s.thisMonthCents).toBe(est);
    expect(s.allTimeCents).toBe(est * 2);
    expect(s.pendingCents).toBe(est);
    expect(s.escrowCents).toBe(est);
    expect(s.failed).toHaveLength(1);
    expect(s.failedCents).toBe(est);
  });
});

test.describe("rows", () => {
  test("a paid vault's capture and payout rows count once in the footer", () => {
    const paid = vault({ id: "v1", payoutStatus: "paid" });
    const rows = buildEarningsRows(
      [paid],
      [
        { id: "e1", at: "2026-11-02T09:00:00Z", type: "PAYMENT.CAPTURED", vaultId: "v1", vaultProject: "Project v1", amountCents: 10_000 } as E,
        { id: "e2", at: "2026-11-02T10:00:00Z", type: "PAYOUT.SENT", vaultId: "v1", vaultProject: "Project v1", amountCents: 8_034 } as E,
      ]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].phase).toBe("paid");
    expect(totalPaidCents(rows)).toBe(freelancerPayoutEstimate(10_000));
  });

  test("filters read vault, event and PayPal ID", () => {
    const rows = buildEarningsRows(
      [vault({ id: "v1", project: "Icon Set", payoutStatus: "paid" })],
      [
        { id: "e1", at: "2026-11-02T09:00:00Z", type: "PAYOUT.SENT", vaultId: "v1", vaultProject: "Icon Set", paypalId: "8XK98765ZY432109D" } as E,
        { id: "e2", at: "2026-11-02T08:00:00Z", type: "FILES.SUBMITTED", vaultId: "v1", vaultProject: "Icon Set" } as E,
      ]
    );
    expect(filterRows(rows, "icon", "all")).toHaveLength(2);
    expect(filterRows(rows, "8xk98", "all")).toHaveLength(1);
    expect(filterRows(rows, "payout sent", "all")).toHaveLength(1);
    expect(filterRows(rows, "", "payouts").map((r) => r.id)).toEqual(["e1"]);
    expect(filterRows(rows, "", "payments")).toHaveLength(0);
    expect(filterRows(rows, "", "files").map((r) => r.id)).toEqual(["e2"]);
  });
});

test.describe("csv", () => {
  test("quotes commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(8034)).toBe("8034");
  });

  test("a value that looks like a formula gets an apostrophe, not a live cell", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+44 7700")).toBe("'+44 7700");
    expect(csvCell("-SUM(A1)")).toBe("'-SUM(A1)");
    expect(csvCell("@import")).toBe("'@import");
    expect(csvCell("=1,2")).toBe('"\'=1,2"');
  });

  test("rows join with CRLF and keep the column order", () => {
    const csv = toCsv([
      ["Time", "Event", "Amount"],
      ["2026-11-02 09:00", "PAYOUT SENT", 8034],
    ]);
    expect(csv.split("\r\n")).toEqual(["Time,Event,Amount", "2026-11-02 09:00,PAYOUT SENT,8034"]);
  });
});

/* ---------------------------------------------------------- payments === */

/* the six freelancer vaults the mock seeds, in the shapes the selectors read */
const SEED_FREELANCER: V[] = [
  vault({ id: "v_0001", project: "Icon Set", amountCents: 12_000, payoutStatus: "failed" }),
  vault({ id: "v_0002", project: "Logo Pack", amountCents: 18_000, uiStatus: "held" }),
  vault({ id: "v_0003", project: "Pitch Deck", amountCents: 45_000, uiStatus: "awaiting_payment" }),
  vault({ id: "v_0004", project: "Landing Page", amountCents: 30_000, uiStatus: "awaiting_payment" }),
  vault({ id: "v_0005", project: "Booking Web App", amountCents: 240_000, uiStatus: "audited" }),
  vault({ id: "v_0006", project: "Brand Guide", amountCents: 9_000, payoutStatus: "paid" }),
];

const SEED_EVENTS = [payout("e_03", "v_0006", "2026-10-26T22:27:00Z", 8_034)];

/* the four client vaults, in the API's dollars */
type CV = Parameters<typeof heldTotal>[0][number];
type CE = Parameters<typeof voidedTotal>[0][number];

const SEED_CLIENT: CV[] = [
  { id: "v_logo_pack", project: "Logo Pack", freelancer: "Maya", amountUSD: 180, status: "held", createdAt: 0 },
  { id: "v_booking_app", project: "Booking Web App", freelancer: "Dev", amountUSD: 2400, status: "audited", createdAt: 0 },
  { id: "v_brand_guide", project: "Brand Guide", freelancer: "Lena", amountUSD: 90, status: "unlocked", createdAt: 0 },
  { id: "v_landing_page", project: "Landing Page", freelancer: "Omar", amountUSD: 300, status: "awaiting_payment", createdAt: 0 },
];

const SEED_CLIENT_EVENTS: CE[] = [
  { id: "e1", ts: 0, type: "PAYMENT.CAPTURED", vaultId: "v_brand_guide", label: "Capture", amountUSD: 90 },
  { id: "e2", ts: 0, type: "PAYMENT.VOIDED", vaultId: "v_booking_app", label: "Void", amountUSD: 2400 },
];

test.describe("payments selectors", () => {
  test("the freelancer cards read the seed", () => {
    expect(paidOut(SEED_FREELANCER)).toBe(8034);
    expect(pendingPayout(SEED_FREELANCER)).toBe(0);
    /* Logo Pack $180 and Booking Web App $2,400, after both fees */
    expect(inEscrow(SEED_FREELANCER)).toBe(231_108);
    expect(failedPayouts(SEED_FREELANCER)).toEqual([
      { vaultId: "v_0001", project: "Icon Set", estimateCents: 10_722 },
    ]);
  });

  test("the client cards read the seed", () => {
    expect(heldTotal(SEED_CLIENT)).toBe(258_000);
    expect(capturedTotal(SEED_CLIENT)).toBe(9_000);
    expect(voidedTotal(SEED_CLIENT_EVENTS)).toBe(240_000);
  });

  test("Overview PAID OUT, Earnings ALL TIME and Payments TOTAL PAID are one number", () => {
    const overview = paidOut(SEED_FREELANCER);
    const earnings = allTimePaidCents(SEED_FREELANCER, SEED_EVENTS);
    const payments = paymentsSummary(SEED_FREELANCER).paidCents;
    expect(overview).toBe(8034);
    expect(earnings).toBe(overview);
    expect(payments).toBe(overview);
  });

  test("a captured or voided hold is no longer held; pending is not paid", () => {
    expect(heldTotal([{ ...SEED_CLIENT[0], status: "unlocked" }])).toBe(0);
    expect(heldTotal([{ ...SEED_CLIENT[0], status: "voided" }])).toBe(0);
    expect(heldTotal([{ ...SEED_CLIENT[0] }])).toBe(18_000);
    const captured = vault({ id: "c1", payoutStatus: "pending", uiStatus: "unlocked" });
    expect(paidOut([captured])).toBe(0);
    expect(pendingPayout([captured])).toBe(freelancerPayoutEstimate(captured.amountCents));
  });

  test("the client summary adds up the three cards in one pass", () => {
    expect(clientPaymentsSummary(SEED_CLIENT, SEED_CLIENT_EVENTS)).toEqual({
      heldCents: 258_000,
      capturedCents: 9_000,
      voidedCents: 240_000,
    });
  });
});
