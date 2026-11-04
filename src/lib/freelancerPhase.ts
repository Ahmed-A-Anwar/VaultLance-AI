/* freelancerPhase.ts — the freelancer's view of a vault's life. Pure: one
   input record in, one phase out, no clock and no storage, so the transitions
   can be tested without a DOM.

   The API exposes five client-side statuses. The freelancer needs finer grain:
   "held" means two different things before and after files are delivered, and
   "unlocked" splits on how the payout went. */

export type UiStatus = "awaiting_payment" | "held" | "audited" | "unlocked" | "voided";
export type PayoutStatus = "pending" | "paid" | "failed";

export interface PhaseInput {
  uiStatus: UiStatus;
  invitedAt?: string | number | null;
  submittedAt?: string | number | null;
  filesCount: number;
  payoutStatus?: PayoutStatus | null;
}

export type Phase =
  | "draft"
  | "invited"
  | "funded"
  | "submitted"
  | "in_review"
  | "paid_pending"
  | "paid"
  | "payout_failed"
  | "voided";

/** The five bolts under every card. */
export const STEPS = ["INVITED", "FUNDED", "SUBMITTED", "APPROVED", "PAID"] as const;
export type StepLabel = (typeof STEPS)[number];

export type NodeState = "done" | "current" | "todo" | "danger";

export interface StepperState {
  nodes: NodeState[];
  /** index carrying aria-current, or -1 when the stepper is complete or frozen */
  current: number;
}

export const isDimmed = (phase: Phase) => phase === "voided";

/**
 * Which phase a vault is in. The most terminal fact wins: a voided hold never
 * reads as "in review" just because it was audited on the way there.
 */
export function phaseOf(v: PhaseInput): Phase {
  if (v.uiStatus === "voided") return "voided";

  if (v.uiStatus === "unlocked") {
    if (v.payoutStatus === "paid") return "paid";
    if (v.payoutStatus === "failed") return "payout_failed";
    return "paid_pending";
  }

  if (v.uiStatus === "audited") return "in_review";

  if (v.uiStatus === "held") return v.submittedAt ? "submitted" : "funded";

  return v.invitedAt ? "invited" : "draft";
}

/**
 * draft:         nothing done, standing on INVITED
 * invited:       INVITED done, standing on FUNDED
 * funded:        through FUNDED done, standing on SUBMITTED
 * submitted:     through SUBMITTED done, standing on APPROVED
 * in_review:     same as submitted
 * paid_pending:  through APPROVED done, standing on PAID
 * paid:          all five done, nothing current
 * payout_failed: through APPROVED done, PAID carries the danger state
 * voided:        frozen mid-flight; no node is current
 */
export function stepperState(phase: Phase): StepperState {
  const build = (done: number, current: number): StepperState => ({
    nodes: STEPS.map((_, i) => (i < done ? "done" : i === current ? "current" : "todo")),
    current,
  });

  switch (phase) {
    case "draft":
      return build(0, 0);
    case "invited":
      return build(1, 1);
    case "funded":
      return build(2, 2);
    case "submitted":
    case "in_review":
      return build(3, 3);
    case "paid_pending":
      return build(4, 4);
    case "paid":
      return { nodes: STEPS.map(() => "done"), current: -1 };
    case "payout_failed":
      return { nodes: STEPS.map((_, i) => (i < 4 ? "done" : "danger")), current: 4 };
    case "voided":
      return { nodes: ["done", "done", "done", "todo", "todo"], current: -1 };
  }
}

/** Card order: whatever needs the freelancer first. */
const NEED_ORDER: Record<Phase, number> = {
  payout_failed: 0,
  funded: 1,
  draft: 2,
  invited: 3,
  submitted: 4,
  in_review: 5,
  paid_pending: 6,
  paid: 7,
  voided: 8,
};

export const needRank = (phase: Phase) => NEED_ORDER[phase];

export function sortByNeed<T extends { phase: Phase; createdAt?: string | number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const byNeed = needRank(a.phase) - needRank(b.phase);
    if (byNeed !== 0) return byNeed;
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  });
}

/** Chip copy, fixed by the spec. */
export const PHASE_LABEL: Record<Phase, string> = {
  draft: "DRAFT",
  invited: "AWAITING CLIENT",
  funded: "FUNDED",
  submitted: "SUBMITTED",
  in_review: "IN REVIEW",
  paid_pending: "PAYOUT PENDING",
  paid: "PAID",
  payout_failed: "PAYOUT FAILED",
  voided: "VOIDED",
};

/** Which filter chip answers for a phase. */
export function filterBucket(phase: Phase): "needs_action" | "in_escrow" | "paid" | "other" {
  switch (phase) {
    case "payout_failed":
    case "funded":
    case "draft":
    case "invited":
      return "needs_action";
    case "submitted":
    case "in_review":
    case "paid_pending":
      return "in_escrow";
    case "paid":
      return "paid";
    case "voided":
      return "other";
  }
}
