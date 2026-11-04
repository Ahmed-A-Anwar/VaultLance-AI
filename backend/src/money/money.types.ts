/**
 * money.types.ts — the shape of the money loop, in integer cents.
 *
 * Amounts are always read from the database and converted here; nothing is
 * ever taken from an HTTP body. One place owns the fee arithmetic so the
 * ledger, the payout and the receipt cannot disagree.
 */

export type PayoutStatus = "none" | "creating" | "pending" | "paid" | "failed" | "blocked";

export interface VaultMoney {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  freelancerId: string;
  authorizationId: string | null;
  paypalOrderId: string | null;
}

export interface CaptureRecord {
  vaultId: string;
  captureId: string;
  status: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  payoutCents: number;
  confirmedVia: "webhook" | "fallback" | "approve" | "sweeper";
}

export interface PayoutRecord {
  vaultId: string;
  status: PayoutStatus;
  amountCents: number;
  currency: string;
  senderBatchId: string;
  payoutItemId: string | null;
  reason: string | null;
  attempt: number;
}

export const PLATFORM_FEE_RATE = 0.05;

export const toCents = (amount: number | string): number => Math.round(Number(amount) * 100);

export const fromCents = (cents: number): number => Math.round(cents) / 100;

export const platformFeeCents = (grossCents: number): number =>
  Math.round(grossCents * PLATFORM_FEE_RATE);

/** freelancer_payout = net_received - round(gross x 0.05) */
export const freelancerPayoutCents = (grossCents: number, netCents: number): number =>
  netCents - platformFeeCents(grossCents);

export const senderBatchIdFor = (vaultId: string, attempt: number): string =>
  attempt > 1 ? `vl-${vaultId}-r${attempt}` : `vl-${vaultId}`;
