import { test, expect } from "@playwright/test";
import {
  fees,
  freelancerPayoutEstimate,
  amountProblem,
  canCreateVault,
  MIN_AMOUNT_CENTS,
  MAX_AMOUNT_CENTS,
} from "../src/lib/fees";
import { phaseOf, stepperState, sortByNeed, PHASE_LABEL } from "../src/lib/freelancerPhase";
import type { Phase, PhaseInput } from "../src/lib/freelancerPhase";

/* The pure modules need no DOM, but they run under Playwright because the repo
   ships no unit runner and the spec forbids new dependencies. */

test.describe("fees", () => {
  test("the five amounts from the spec", () => {
    // $10 - the sandbox capture that fixed the PayPal constants ($0.84)
    expect(fees(1000)).toEqual({
      amountCents: 1000,
      vaultlanceFeeCents: 50,
      paypalFeeCents: 84,
      payoutCents: 866,
    });
    expect(freelancerPayoutEstimate(9000)).toBe(8034); // $90
    expect(freelancerPayoutEstimate(18000)).toBe(16098); // $180
    expect(freelancerPayoutEstimate(240000)).toBe(215010); // $2,400
    expect(freelancerPayoutEstimate(500)).toBe(418); // $5, the minimum
  });

  test("fees always sum back to the amount", () => {
    for (const amount of [500, 501, 999, 1000, 12345, 999_999, MAX_AMOUNT_CENTS]) {
      const f = fees(amount);
      expect(f.vaultlanceFeeCents + f.paypalFeeCents + f.payoutCents).toBe(amount);
    }
  });

  test("a $1 vault is refused, and so is anything under the floor", () => {
    expect(canCreateVault(100)).toBe(false);
    expect(amountProblem(100)).toBe("too_small");
    expect(canCreateVault(MIN_AMOUNT_CENTS - 1)).toBe(false);
    expect(canCreateVault(MIN_AMOUNT_CENTS)).toBe(true);
    expect(amountProblem(MAX_AMOUNT_CENTS + 1)).toBe("too_large");
    expect(amountProblem(Number.NaN)).toBe("not_a_number");
  });

  test("a payout that the fees would erase is refused", () => {
    // 5% + 5.4% + 30c: below the $5 floor this could go negative, so it must
    // never be creatable whatever the constants are tuned to.
    for (let c = 1; c < MIN_AMOUNT_CENTS; c++) {
      if (freelancerPayoutEstimate(c) <= 0) expect(canCreateVault(c)).toBe(false);
    }
    expect(canCreateVault(100)).toBe(false);
  });
});

test.describe("phase model", () => {
  const base: PhaseInput = { uiStatus: "awaiting_payment", filesCount: 0 };

  const phase = (input: Partial<PhaseInput>) => phaseOf({ ...base, ...input });

  test("voided wins over everything", () => {
    expect(phase({ uiStatus: "voided", submittedAt: "2026-01-02", payoutStatus: "paid" })).toBe("voided");
  });

  test("unlocked splits on the payout", () => {
    expect(phase({ uiStatus: "unlocked", payoutStatus: "paid" })).toBe("paid");
    expect(phase({ uiStatus: "unlocked", payoutStatus: "failed" })).toBe("payout_failed");
    expect(phase({ uiStatus: "unlocked", payoutStatus: "pending" })).toBe("paid_pending");
    expect(phase({ uiStatus: "unlocked" })).toBe("paid_pending");
  });

  test("audited is in review", () => {
    expect(phase({ uiStatus: "audited" })).toBe("in_review");
  });

  test("held splits on delivery", () => {
    expect(phase({ uiStatus: "held" })).toBe("funded");
    expect(phase({ uiStatus: "held", submittedAt: "2026-01-02T10:00:00Z" })).toBe("submitted");
    // a vault with files but no submit event is still only funded
    expect(phase({ uiStatus: "held", filesCount: 4 })).toBe("funded");
  });

  test("awaiting payment splits on the invite", () => {
    expect(phase({ uiStatus: "awaiting_payment" })).toBe("draft");
    expect(phase({ uiStatus: "awaiting_payment", invitedAt: "2026-01-02T10:00:00Z" })).toBe("invited");
  });

  test("every phase has a chip label", () => {
    for (const p of Object.keys(PHASE_LABEL) as Phase[]) expect(PHASE_LABEL[p].length).toBeGreaterThan(0);
  });
});

test.describe("stepper nodes", () => {
  const nodes = (p: Phase) => stepperState(p).nodes.join(",");

  test("each phase lands on the bolts the spec fixed", () => {
    expect(nodes("draft")).toBe("current,todo,todo,todo,todo");
    expect(nodes("invited")).toBe("done,current,todo,todo,todo");
    expect(nodes("funded")).toBe("done,done,current,todo,todo");
    expect(nodes("submitted")).toBe("done,done,done,current,todo");
    expect(nodes("in_review")).toBe("done,done,done,current,todo");
    expect(nodes("paid_pending")).toBe("done,done,done,done,current");
    expect(nodes("paid")).toBe("done,done,done,done,done");
    expect(nodes("payout_failed")).toBe("done,done,done,done,danger");
    expect(nodes("voided")).toBe("done,done,done,todo,todo");
  });

  test("the current node is the one marked aria-current", () => {
    expect(stepperState("draft").current).toBe(0);
    expect(stepperState("funded").current).toBe(2);
    expect(stepperState("paid_pending").current).toBe(4);
    // nothing is current once the flow is finished or frozen
    expect(stepperState("paid").current).toBe(-1);
    expect(stepperState("voided").current).toBe(-1);
  });
});

test.describe("sort by need", () => {
  test("what needs the freelancer comes first", () => {
    const rows = [
      { id: "paid", phase: "paid" as Phase },
      { id: "failed", phase: "payout_failed" as Phase },
      { id: "invited", phase: "invited" as Phase },
      { id: "funded", phase: "funded" as Phase },
      { id: "voided", phase: "voided" as Phase },
      { id: "draft", phase: "draft" as Phase },
    ];
    expect(sortByNeed(rows).map((r) => r.id)).toEqual([
      "failed",
      "funded",
      "draft",
      "invited",
      "paid",
      "voided",
    ]);
  });
});
