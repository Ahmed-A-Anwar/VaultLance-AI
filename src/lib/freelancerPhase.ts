/* freelancerPhase.ts — the freelancer's view of a vault's life, derived from
   the client-side status the API already exposes. Pure: one input, one phase,
   no clock, no storage, so it can be tested without a DOM.

   The client dashboard has five statuses; the freelancer needs finer grain
   because "held" means two very different things depending on whether files
   have been delivered, and "unlocked" splits on how the payout went. */

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

/** The five bolts the freelancer's card shows. */
export const STEPS = ["INVITED", "FUNDED", "SUBMITTED", "APPROVED", "PAID"] as const;
export type StepLabel = (typeof STEPS)[number];

export type NodeState = "done" | "current" | "todo" | "danger";

export interface StepperState {
  nodes: NodeState[];
  /** index of the node marked aria-current, or -1 for a frozen/dimmed card */
  current: number;
}

/** The vault is voided: the card dims and the stepper freezes on its last node. */
export const isDimmed = (phase: Phase) => phase === "voided";

/**
 * Which phase a vault is in. Order matters: the most terminal fact wins, so a
 * voided hold never reads as "in review" just because it was audited first.
 */
export function phaseOf(v: PhaseInput): Phase {
  const status = v.uiStatus;

  if (status === "voided") return "voided";

  if (status === "unlocked") {
    if (v.payoutStatus === "paid") return "paid";
    if (v.payoutStatus === "failed") return "payout_failed";
    return "paid_pending";
  }

  if (status === "audited") return "in_review";

  if (status === "held") return v.submittedAt ? "submitted" : "funded";

  // awaiting_payment
  return v.invitedAt ? "invited" : "draft";
}

/**
 * The five bolts for a phase.
 *
 * draft:        nothing done, standing on INVITED
 * invited:      INVITED done, standing on FUNDED
 * funded:       through FUNDED done, standing on SUBMITTED
 * submitted:    through SUBMITTED done, standing on APPROVED (same as review)
 * in_review:    through SUBMITTED done, standing on APPROVED
 * paid_pending: through APPROVED done, standing on PAID
 * paid:         all five done
 * payout_failed: through APPROVED done, PAID in danger
 * voided:       frozen — every node that was reached stays done, none current
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
      return {
        nodes: STEPS.map((_, i) => (i < 4 ? "done" : "danger")),
        current: 4,
      };
    case "voided":
      // the hold ended before or after delivery; the bolts stop where they were
      return { nodes: ["done", "done", "done", "todo", "todo"], current: -1 };
  }
}

/** Ordering for the card list: whatever needs the freelancer first. */
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
    const d = needRank(a.phase) - needRank(b.phase);
    if (d !== 0) return d;
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  });
}

/** The chip label for a phase, in the order the spec fixed. */
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

/** Which filter chip a phase answers to. */
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
