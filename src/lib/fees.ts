/* fees.ts — what a vault costs the freelancer. Pure functions over integer
   cents, and every figure the UI shows has been rounded exactly once, here.

   The two rates are the only numbers to tune. PayPal's published commercial
   rate is 3.49% + $0.49, but the sandbox we tested captured $0.84 on $10.00,
   which is what this mock reproduces: 5.4% + 30c. VaultLance takes 5% flat.
   Both constants live here so the drawer estimate, the card hint and the
   IN ESCROW KPI can never disagree. */

/** VaultLance's cut in basis points. 500bp = 5%. */
export const VAULTLANCE_RATE_BPS = 500;

/** PayPal's estimated percentage cut, in basis points. 540bp = 5.4%. */
export const PAYPAL_RATE_BPS = 540;

/** PayPal's flat per-capture charge, in cents. */
export const PAYPAL_FIXED_CENTS = 30;

/** The smallest and largest vault we accept, in cents: $5 and $10,000. */
export const MIN_AMOUNT_CENTS = 500;
export const MAX_AMOUNT_CENTS = 1_000_000;

export interface FeeBreakdown {
  amountCents: number;
  vaultlanceFeeCents: number;
  paypalFeeCents: number;
  /** amount - both fees; <= 0 means the vault is not worth creating */
  payoutCents: number;
}

export function vaultlanceFee(amountCents: number): number {
  return Math.round((amountCents * VAULTLANCE_RATE_BPS) / 10_000);
}

export function paypalFeeEstimate(amountCents: number): number {
  return Math.round((amountCents * PAYPAL_RATE_BPS) / 10_000) + PAYPAL_FIXED_CENTS;
}

/** The whole breakdown for one amount. */
export function fees(amountCents: number): FeeBreakdown {
  const amount = Math.round(amountCents);
  const vaultlance = vaultlanceFee(amount);
  const paypal = paypalFeeEstimate(amount);
  return {
    amountCents: amount,
    vaultlanceFeeCents: vaultlance,
    paypalFeeCents: paypal,
    payoutCents: amount - vaultlance - paypal,
  };
}

/** What the freelancer receives after both cuts. */
export function freelancerPayoutEstimate(amountCents: number): number {
  return fees(amountCents).payoutCents;
}

export type AmountProblem = "too_small" | "too_large" | "not_a_number" | "negative_payout";

/** Why this amount cannot be a vault, or null when it can. */
export function amountProblem(amountCents: number): AmountProblem | null {
  if (!Number.isFinite(amountCents)) return "not_a_number";
  const amount = Math.round(amountCents);
  if (amount < MIN_AMOUNT_CENTS) return "too_small";
  if (amount > MAX_AMOUNT_CENTS) return "too_large";
  if (freelancerPayoutEstimate(amount) <= 0) return "negative_payout";
  return null;
}

export function canCreateVault(amountCents: number): boolean {
  return amountProblem(amountCents) === null;
}

/** $2,400.00 — one money format for the whole surface. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
