/* statusMap.ts — every status the API speaks, against the five the dashboard
   uses: awaiting_payment / held / audited / unlocked / voided.

   Two states have no equivalent of their own, and the mapping is deliberate:
   NEEDS_REVISION is still work under review (audited); DISPUTED is frozen and
   never unlocks (voided). CAPTURE_PENDING is *not* unlocked — files stay sealed
   until the server says PAID.

   A state the server adds later renders as voided with one console warning per
   unknown value: never a crash, never a guess into unlocked. */

export type UiStatus = "awaiting_payment" | "held" | "audited" | "unlocked" | "voided";

/* Express vault state machine (backend/src/shared/types.ts, vault.schemas.ts) */
export type ExpressVaultStatus =
  | "DRAFT"
  | "AWAITING_CLIENT"
  | "AWAITING_AUTHORIZATION"
  | "AUTHORIZED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "VERIFYING"
  | "NEEDS_REVISION"
  | "AWAITING_APPROVAL"
  | "CAPTURE_PENDING"
  | "PAID"
  | "CANCELLED"
  | "EXPIRED"
  | "DISPUTED";

/* What the server may put on a payout: money/payout.service.ts */
export type PayoutStatus = "none" | "creating" | "pending" | "paid" | "failed" | "blocked";

export const STATUS_MAP: Readonly<Record<ExpressVaultStatus, UiStatus>> = {
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
};

const warned = new Set<string>();

/** One warning per unknown value per page, however many rows carry it. */
export function warnUnknownStatus(status: string): void {
  if (warned.has(status)) return;
  warned.add(status);
  console.warn(`[vault] unknown status "${status}" — rendered as voided`);
}

/** Tests only: forget which warnings have been printed. */
export const resetStatusWarnings = (): void => {
  warned.clear();
};

/** The UI status for any raw status string, unknown values included. */
export function uiStatusOf(raw: unknown): UiStatus {
  const key = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  const hit = STATUS_MAP[key as ExpressVaultStatus];
  if (hit) return hit;
  warnUnknownStatus(key || "(empty)");
  return "voided";
}

export type UiPayoutStatus = "pending" | "paid" | "failed";

/* `blocked` is a failed payout the server gave a reason for. */
const PAYOUT_MAP: Readonly<Record<PayoutStatus, UiPayoutStatus>> = {
  none: "pending",
  creating: "pending",
  pending: "pending",
  paid: "paid",
  failed: "failed",
  blocked: "failed",
};

/** A payout the UI can draw, or undefined when the server sent no status. */
export function uiPayoutStatusOf(raw: unknown): UiPayoutStatus | undefined {
  const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return PAYOUT_MAP[key as PayoutStatus];
}
