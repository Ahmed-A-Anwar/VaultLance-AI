/* fees.ts — what a vault costs the freelancer. Pure functions, integer cents,
   no floating point left in the result: every amount that reaches the UI has
   already been rounded once, here.

   The two rates are the only numbers to tune. PayPal's published rate for a
   commercial transaction is 3.49% + $0.49 (or 2.99% + $0.49 for QR), but the
   sandbox we tested against charged $0.84 on a $10.00 capture, which is the
   figure this mock is built to match. VaultLance takes 5% flat. Keep both in
   this file so the estimate in the drawer, the card hint and the KPI agree. */

/** VaultLance's cut, in basis points of the vault amount. 500bp = 5%. */
export const VAULTLANCE_RATE_BPS = 500;

/** PayPal's estimated cut: 5.4% of the amount... */
export const PAYPAL_RATE_BPS = 540;
/** ...plus a flat 30c per capture. Together they reproduce the $0.84/$10. */
export const PAYPAL_FIXED_CENTS = 30;

/** The smallest vault we accept, and the largest. */
export const MIN_AMOUNT_CENTS = 500;
export const MAX_AMOUNT_CENTS = 1_000_000;

export interface FeeBreakdown {
  amountCents: number;
  vaultlanceFeeCents: number;
  paypalFeeCents: number;
  /** amount - vaultlance - paypal; may be <= 0 for tiny amounts */
  payoutCents: number;
}

const roundCents = (n: number) => Math.round(n);

export function vaultlanceFee(amountCents: number): number {
  return roundCents((amountCents * VAULTLANCE_RATE_BPS) / 10_000);
}

export function paypalFeeEstimate(amountCents: number): number {
  return roundCents((amountCents * PAYPAL_RATE_BPS) / 10_000) + PAYPAL_FIXED_CENTS;
}

/** The full breakdown for one vault amount. */
export function fees(amountCents: number): FeeBreakdown {
  const amount = roundCents(amountCents);
  const vaultlance = vaultlanceFee(amount);
  const paypal = paypalFeeEstimate(amount);
  return {
    amountCents: amount,
    vaultlanceFeeCents: vaultlance,
    paypalFeeCents: paypal,
    payoutCents: amount - vaultlance - paypal,
  };
}

/** What the freelancer actually receives, after both cuts. */
export function freelancerPayoutEstimate(amountCents: number): number {
  return fees(amountCents).payoutCents;
}

export type AmountProblem = "too_small" | "too_large" | "not_a_number" | "negative_payout";

/**
 * Can this amount be a vault at all? A payout on which the fees eat the whole
 * amount is refused rather than shown as a negative figure.
 */
export function amountProblem(amountCents: number): AmountProblem | null {
  if (!Number.isFinite(amountCents)) return "not_a_number";
  const amount = roundCents(amountCents);
  if (amount < MIN_AMOUNT_CENTS) return "too_small";
  if (amount > MAX_AMOUNT_CENTS) return "too_large";
  if (freelancerPayoutEstimate(amount) <= 0) return "negative_payout";
  return null;
}

/** A vault is only worth creating if the freelancer clears something. */
export function canCreateVault(amountCents: number): boolean {
  return amountProblem(amountCents) === null;
}

/** $2,400.00 — the form's own money format, no currency symbol guesswork. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
