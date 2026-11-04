/* freelancer-libs.spec.ts — the two pure modules behind the freelancer
   surface. No DOM, no network: every assertion is a value the UI will render. */

import { test, expect } from "@playwright/test";
import {
  fees,
  freelancerPayoutEstimate,
  formatCents,
  amountProblem,
  canCreateVault,
  MIN_AMOUNT_CENTS,
  MAX_AMOUNT_CENTS,
} from "../src/lib/fees";
import { formatRelative } from "../src/lib/formatRelative";
import {
  phaseOf,
  stepperState,
  isDimmed,
  sortByNeed,
  filterBucket,
  PHASE_LABEL,
  STEPS,
  type Phase,
  type PhaseInput,
} from "../src/lib/freelancerPhase";

const vault = (patch: Partial<PhaseInput> = {}): PhaseInput => ({
  uiStatus: "awaiting_payment",
  filesCount: 0,
  ...patch,
});

test.describe("fees", () => {
  test("the five spec amounts land on the exact payout", () => {
    /* $10 is the sandbox figure: 5% + 5.4% + 30c = $1.34 of fees */
    expect(fees(1000)).toEqual({
      amountCents: 1000,
      vaultlanceFeeCents: 50,
      paypalFeeCents: 84,
      payoutCents: 866,
    });
    expect(freelancerPayoutEstimate(9000)).toBe(8034);
    expect(freelancerPayoutEstimate(18_000)).toBe(16_098);
    /* 2400 - 120 (5%) - 129.90 (5.4% + 30c) = 2150.10 */
    expect(freelancerPayoutEstimate(240_000)).toBe(215_010);
    expect(freelancerPayoutEstimate(500)).toBe(418);
  });

  test("the breakdown always re-adds to the amount", () => {
    for (const cents of [500, 1000, 9000, 18_000, 240_000, 1_000_000, 1234, 99_999]) {
      const f = fees(cents);
      expect(f.vaultlanceFeeCents + f.paypalFeeCents + f.payoutCents).toBe(cents);
    }
  });

  test("$1 is refused, $5 and $10,000 are accepted", () => {
    expect(amountProblem(100)).toBe("too_small");
    expect(canCreateVault(100)).toBe(false);
    expect(amountProblem(MIN_AMOUNT_CENTS)).toBeNull();
    expect(amountProblem(MAX_AMOUNT_CENTS)).toBeNull();
    expect(amountProblem(MAX_AMOUNT_CENTS + 1)).toBe("too_large");
    expect(amountProblem(Number.NaN)).toBe("not_a_number");
  });

  test("money formats with cents and a dollar sign", () => {
    expect(formatCents(866)).toBe("$8.66");
    expect(formatCents(240_000)).toBe("$2,400.00");
  });
});

test.describe("phase", () => {
  const cases: Array<[string, PhaseInput, Phase]> = [
    ["a fresh draft", vault(), "draft"],
    ["invited but unpaid", vault({ invitedAt: 1 }), "invited"],
    ["held, nothing delivered", vault({ uiStatus: "held" }), "funded"],
    ["held with a submission", vault({ uiStatus: "held", submittedAt: 2 }), "submitted"],
    ["audited", vault({ uiStatus: "audited", submittedAt: 2, filesCount: 4 }), "in_review"],
    ["unlocked, payout pending", vault({ uiStatus: "unlocked", payoutStatus: "pending" }), "paid_pending"],
    ["unlocked and paid", vault({ uiStatus: "unlocked", payoutStatus: "paid" }), "paid"],
    ["unlocked, payout failed", vault({ uiStatus: "unlocked", payoutStatus: "failed" }), "payout_failed"],
    ["voided after an audit", vault({ uiStatus: "voided", submittedAt: 2 }), "voided"],
  ];

  for (const [name, input, expected] of cases) {
    test(`${name} is ${expected}`, () => {
      expect(phaseOf(input)).toBe(expected);
    });
  }

  test("the terminal fact wins: voided beats audit and payout", () => {
    expect(phaseOf(vault({ uiStatus: "voided", payoutStatus: "failed" }))).toBe("voided");
  });

  test("every stepper state matches the spec", () => {
    expect(stepperState("draft")).toEqual({
      nodes: ["current", "todo", "todo", "todo", "todo"],
      current: 0,
    });
    expect(stepperState("invited")).toEqual({
      nodes: ["done", "current", "todo", "todo", "todo"],
      current: 1,
    });
    expect(stepperState("funded")).toEqual({
      nodes: ["done", "done", "current", "todo", "todo"],
      current: 2,
    });
    expect(stepperState("submitted")).toEqual({
      nodes: ["done", "done", "done", "current", "todo"],
      current: 3,
    });
    expect(stepperState("in_review")).toEqual(stepperState("submitted"));
    expect(stepperState("paid_pending")).toEqual({
      nodes: ["done", "done", "done", "done", "current"],
      current: 4,
    });
    expect(stepperState("paid")).toEqual({
      nodes: ["done", "done", "done", "done", "done"],
      current: -1,
    });
    expect(stepperState("payout_failed")).toEqual({
      nodes: ["done", "done", "done", "done", "danger"],
      current: 4,
    });
    expect(stepperState("voided")).toEqual({
      nodes: ["done", "done", "done", "todo", "todo"],
      current: -1,
    });
    expect(stepperState("paid").nodes).toHaveLength(STEPS.length);
  });

  test("only a voided card dims", () => {
    expect(isDimmed("voided")).toBe(true);
    for (const p of ["draft", "funded", "paid", "payout_failed"] as Phase[]) {
      expect(isDimmed(p)).toBe(false);
    }
  });

  test("sorting puts the work that needs the freelancer first", () => {
    const rows: Array<{ phase: Phase; createdAt?: number }> = [
      { phase: "paid", createdAt: 1 },
      { phase: "draft", createdAt: 2 },
      { phase: "payout_failed", createdAt: 3 },
      { phase: "funded", createdAt: 4 },
      { phase: "voided", createdAt: 5 },
      { phase: "invited", createdAt: 6 },
    ];
    expect(sortByNeed(rows).map((r) => r.phase)).toEqual([
      "payout_failed",
      "funded",
      "draft",
      "invited",
      "paid",
      "voided",
    ]);
  });

  test("every phase has a chip label and a filter bucket", () => {
    const phases = Object.keys(PHASE_LABEL) as Phase[];
    expect(phases).toHaveLength(9);
    for (const p of phases) {
      expect(PHASE_LABEL[p]).toBe(PHASE_LABEL[p].toUpperCase());
      expect(filterBucket(p)).toBeTruthy();
    }
    expect(filterBucket("payout_failed")).toBe("needs_action");
    expect(filterBucket("paid_pending")).toBe("in_escrow");
    expect(filterBucket("paid")).toBe("paid");
  });
});

test.describe("formatRelative", () => {
  const now = new Date("2026-11-04T12:00:00Z").getTime();

  test("accepts a Date, an ISO string and ms", () => {
    expect(formatRelative(new Date(now - 30_000), now)).toBe("just now");
    expect(formatRelative(new Date(now - 26 * 3_600_000).toISOString(), now)).toBe("1d ago");
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(formatRelative(String(now - 90_000), now)).toBe("2m ago");
  });

  test("invalid input renders an em dash, never NaN", () => {
    for (const bad of [undefined, null, "", "not a time", Number.NaN, "e_10"]) {
      expect(formatRelative(bad, now)).toBe("—");
    }
    expect(formatRelative({ at: 1 }, now)).toBe("—");
  });
});
