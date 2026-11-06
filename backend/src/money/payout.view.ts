/**
 * payout.view.ts — what a payout status may say, and to whom.
 *
 * The freelancer owns the money and sees the arithmetic; the client sees that
 * the payout is moving, never the fee split or the payout address. A failure is
 * reduced to a short code and one fixed sentence: the provider's body, a stack
 * trace or an email address never leaves the server.
 */
import { ForbiddenError } from "../shared/errors.js";
import { isClientMember } from "./access.js";
import * as store from "./money.store.js";
import { platformFeeCents, type PayoutStatus } from "./money.types.js";

export interface PayoutFailure {
  code: string;
  message: string;
}

export interface PayoutCents {
  gross: number;
  vaultlanceFee: number;
  paypalFee: number;
  net: number;
  payout: number;
}

export interface PayoutTimestamps {
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FreelancerPayoutView {
  role: "freelancer";
  status: PayoutStatus;
  attempt: number;
  cents: PayoutCents | null;
  payoutItemId: string | null;
  timestamps: PayoutTimestamps;
  failure: PayoutFailure | null;
}

export interface ClientPayoutView {
  role: "client";
  status: PayoutStatus;
  timestamps: PayoutTimestamps;
}

export type PayoutView = FreelancerPayoutView | ClientPayoutView;

/* Every sentence is fixed. The raw reason is only matched, never echoed, so a
   provider message that happens to contain the recipient's address stays out. */
const FAILURE_COPY = {
  PAYOUT_EMAIL_MISSING: "No payout address is available for this account.",
  PAYPAL_INSUFFICIENT_FUNDS: "PayPal could not cover this payout.",
  PAYOUT_BLOCKED: "The amount left after fees is too small to send.",
  PAYPAL_REFUSED: "PayPal did not accept this payout.",
} as const;

type FailureCode = keyof typeof FAILURE_COPY;

/** Short code plus one human sentence; never the provider's own text. */
export function sanitizeFailureReason(reason: string | null | undefined): PayoutFailure | null {
  if (!reason) return null;
  const raw = reason.toLowerCase();
  let code: FailureCode = "PAYPAL_REFUSED";
  if (/@|email|recipient|receiver|address/.test(raw)) code = "PAYOUT_EMAIL_MISSING";
  else if (/insufficient|balance|funds/.test(raw)) code = "PAYPAL_INSUFFICIENT_FUNDS";
  else if (/blocked|not positive|too small|below/.test(raw)) code = "PAYOUT_BLOCKED";
  return { code, message: FAILURE_COPY[code] };
}

/** Null means "not found, or not a member": the route answers one 404 for both. */
export async function buildPayoutView(userId: string, vaultId: string): Promise<PayoutView | null> {
  const vault = await store.getVaultMoney(vaultId);
  if (!vault) return null;

  let role: "freelancer" | "client";
  if (vault.freelancerId === userId) role = "freelancer";
  else if (await isClientMember(userId, vaultId)) role = "client";
  else return null;

  const [payout, capture] = await Promise.all([store.getPayout(vaultId), store.getCapture(vaultId)]);
  const status: PayoutStatus = payout?.status ?? "none";
  const timestamps: PayoutTimestamps = {
    createdAt: payout?.createdAt ?? null,
    updatedAt: payout?.updatedAt ?? payout?.createdAt ?? null,
  };

  if (role === "client") return { role, status, timestamps };

  const cents: PayoutCents | null = capture
    ? {
        gross: capture.grossCents,
        vaultlanceFee: platformFeeCents(capture.grossCents),
        paypalFee: capture.feeCents,
        net: capture.netCents,
        payout: capture.payoutCents,
      }
    : null;

  return {
    role,
    status,
    attempt: payout?.attempt ?? 0,
    cents,
    payoutItemId: payout?.payoutItemId ?? null,
    timestamps,
    failure: status === "failed" || status === "blocked" ? sanitizeFailureReason(payout?.reason) : null,
  };
}

/** Kept for callers that want the 403 without a vault read. */
export function assertPayoutMember(isMember: boolean): void {
  if (!isMember) throw new ForbiddenError("Only a member can read this payout.", "MEMBERSHIP_REQUIRED");
}
