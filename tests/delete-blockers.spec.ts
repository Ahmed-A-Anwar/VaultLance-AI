/* delete-blockers.spec.ts — the freelancer's delete decision, purely over the
   phase model. An account with money in motion cannot go: funded vaults are
   in escrow, submitted/in-review ones wait on a verdict, paid-pending ones are
   one capture away, and a failed payout is until it is resolved. */

import { test, expect } from "@playwright/test";
import { deleteFreelancerBlockers } from "../src/components/freelancer/deleteBlockers";
import type { FreelancerVault } from "../src/components/freelancer/mockApi";

const vault = (patch: Partial<FreelancerVault> & { id: string }): FreelancerVault =>
  ({
    project: patch.project ?? `Project ${patch.id}`,
    clientName: "Ahmed",
    clientEmail: "ahmed@northlight.co",
    amountCents: 10_000,
    uiStatus: "awaiting_payment",
    kind: "design",
    filesCount: 0,
    files: [],
    createdAt: 0,
    ...patch,
  }) as FreelancerVault;

const withPaid = (v: FreelancerVault, payoutStatus: "pending" | "paid" | "failed"): FreelancerVault =>
  ({ ...v, payoutStatus }) as FreelancerVault;

test("clean states leave nothing in the way", () => {
  const clean = [
    vault({ id: "v1", uiStatus: "awaiting_payment" }), // draft/invited: money not yet authorized
    withPaid(vault({ id: "v2", uiStatus: "unlocked" }), "paid"), // done, money gone
    vault({ id: "v3", uiStatus: "voided" }),
  ];
  expect(deleteFreelancerBlockers(clean)).toEqual([]);
});

test("funded vaults block: the money is in escrow", () => {
  const [blocker] = deleteFreelancerBlockers([vault({ id: "v1", uiStatus: "held" })]);
  expect(blocker?.id).toBe("v1");
  expect(blocker?.label).toBe("FUNDED");
});

test("submitted and in-review vaults block: a verdict is owed", () => {
  const submitted = deleteFreelancerBlockers([
    vault({ id: "v_sub", uiStatus: "held", submittedAt: 1, filesCount: 2 }),
  ]);
  const inReview = deleteFreelancerBlockers([
    vault({ id: "v_rev", uiStatus: "audited", filesCount: 2 }),
  ]);
  expect(submitted.map((b) => b.id)).toEqual(["v_sub"]);
  expect(inReview.map((b) => b.id)).toEqual(["v_rev"]);
});

test("paid_pending blocks: one capture away from payout", () => {
  const pending = withPaid(vault({ id: "v_pay", uiStatus: "unlocked" }), "pending");
  expect(deleteFreelancerBlockers([pending]).map((b) => b.id)).toEqual(["v_pay"]);
});

test("a failed payout blocks until it is resolved", () => {
  const failed = withPaid(vault({ id: "v_fail", uiStatus: "unlocked" }), "failed");
  const [blocker] = deleteFreelancerBlockers([failed]);
  expect(blocker?.id).toBe("v_fail");
  expect(blocker?.status).toBe("PAYOUT FAILED");
});

test("the seed's problem vaults are exactly the blockers", () => {
  const seed = [
    withPaid(vault({ id: "v1", amountCents: 12_000, uiStatus: "unlocked" }), "paid"),
    vault({ id: "v2", uiStatus: "held" }),
    vault({ id: "v3", uiStatus: "audited", filesCount: 3 }),
    withPaid(vault({ id: "v4", uiStatus: "unlocked" }), "paid"),
    vault({ id: "v5", uiStatus: "awaiting_payment" }),
  ];
  expect(deleteFreelancerBlockers(seed).map((b) => b.id)).toEqual(["v2", "v3"]);
});
