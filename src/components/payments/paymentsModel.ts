/* paymentsModel.ts — the Payments page's shapes and pure transforms. No fetch,
   no clock of its own, no browser: the tests call these with the seed, and
   paymentsApi.ts is the same functions behind a delay.

   The fee split comes from lib/fees and the paid total from lib/earnings, so
   the history, the summary cards and the Overview cannot disagree. */

import { freelancerPayoutEstimate, paypalFeeEstimate, vaultlanceFee } from "../../lib/fees";
import type { LedgerEvent, Vault } from "../../lib/api";
import type { FreelancerEvent, FreelancerVault } from "../freelancer/mockApi";

/* ================================================================ types === */

export type PayoutStatus = "pending" | "paid" | "failed";

export interface Payout {
  id: string;
  vaultId: string;
  project: string;
  grossCents: number;
  vaultlanceFeeCents: number;
  paypalFeeCents: number;
  netCents: number;
  status: PayoutStatus;
  paypalPayoutId?: string;
  createdAt: number;
  paidAt?: number;
  failureReason?: string;
}

export interface Receipt {
  id: string;
  vaultId: string;
  project: string;
  kind: "capture" | "void";
  amountCents: number;
  paypalId: string;
  createdAt: number;
}

export interface Hold {
  vaultId: string;
  project: string;
  amountCents: number;
  authorizedAt: number;
  expiresAt: number;
}

export interface PayoutProfile {
  paypalEmail: string | null;
  verified: boolean;
  currency: "USD";
}

/* ============================================================== constants === */

/** PayPal holds an authorization for about 29 days; a rejected vault keeps its
    honor period for 3 of those days. Both are shown, neither is enforced here. */
export const HOLD_DAYS = 29;
export const HONOR_DAYS = 3;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** The string a failed payout shows. A simulation, shaped like the real
    provider's refusal so the copy is not a placeholder. */
export const FAILURE_REASON = "PayPal could not reach the recipient.";

/** The freelancer's PayPal address. Mock, and the only place it is written. */

/* ============================================================== transforms === */

/** One payout row per vault that has a payout status. Gross is what the client
    paid, net is what the freelancer received; the two fees are the difference
    and both come from lib/fees, rounded once there. */
export function payoutsFrom(vaults: FreelancerVault[], events: FreelancerEvent[]): Payout[] {
  const latest = new Map<string, number>();
  const sent = new Map<string, number>();
  for (const e of events) {
    const ms = Date.parse(e.at);
    if (!Number.isFinite(ms)) continue;
    if (e.type === "PAYOUT.SENT") sent.set(e.vaultId, Math.max(sent.get(e.vaultId) ?? 0, ms));
    if (e.type === "PAYOUT.SENT" || e.type === "PAYOUT.FAILED") {
      latest.set(e.vaultId, Math.max(latest.get(e.vaultId) ?? 0, ms));
    }
  }

  return vaults
    .filter((v) => v.payoutStatus === "paid" || v.payoutStatus === "pending" || v.payoutStatus === "failed")
    .map((v): Payout => {
      const status = v.payoutStatus as PayoutStatus;
      return {
        id: `po_${v.id}`,
        vaultId: v.id,
        project: v.project,
        grossCents: v.amountCents,
        vaultlanceFeeCents: vaultlanceFee(v.amountCents),
        paypalFeeCents: paypalFeeEstimate(v.amountCents),
        netCents: freelancerPayoutEstimate(v.amountCents),
        status,
        paypalPayoutId: v.payoutPaypalId,
        createdAt: latest.get(v.id) ?? v.lastEventAt ?? v.createdAt,
        paidAt: status === "paid" ? sent.get(v.id) ?? v.lastEventAt ?? undefined : undefined,
        failureReason: status === "failed" ? FAILURE_REASON : undefined,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** A receipt is a capture or a void. The project name is joined from the vault
    the ledger row belongs to; a row whose vault is gone keeps its own label. */
export function receiptsFrom(vaults: Vault[], events: LedgerEvent[]): Receipt[] {
  const name = new Map(vaults.map((v) => [v.id, v.project]));
  return events
    .filter((e) => e.type === "PAYMENT.CAPTURED" || e.type === "PAYMENT.VOIDED")
    .map((e): Receipt => ({
      id: `rc_${e.id}`,
      vaultId: e.vaultId,
      project: name.get(e.vaultId) ?? e.label,
      kind: e.type === "PAYMENT.CAPTURED" ? "capture" : "void",
      amountCents: Math.round((e.amountUSD ?? 0) * 100),
      paypalId: e.paypalId ?? "—",
      createdAt: e.ts,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** An active hold is money still authorized: held, or held and in audit. The
    clock starts at the latest authorization, which is the one that counts when
    a stale hold was voided and a fresh one taken. */
export function holdsFrom(vaults: Vault[], events: LedgerEvent[]): Hold[] {
  const authorized = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "PAYMENT.AUTHORIZED") continue;
    authorized.set(e.vaultId, Math.max(authorized.get(e.vaultId) ?? 0, e.ts));
  }
  return vaults
    .filter((v) => v.status === "held" || v.status === "audited")
    .map((v): Hold => {
      const authorizedAt = authorized.get(v.id) ?? v.createdAt;
      return {
        vaultId: v.id,
        project: v.project,
        amountCents: Math.round(v.amountUSD * 100),
        authorizedAt,
        expiresAt: authorizedAt + HOLD_DAYS * DAY_MS,
      };
    })
    .sort((a, b) => a.expiresAt - b.expiresAt);
}

/** Days left on a hold, rounded up: the last day still says "1 day". */
export function daysLeft(hold: Hold, now = Date.now()): number {
  return Math.max(0, Math.ceil((hold.expiresAt - now) / DAY_MS));
}

/** The three summary cards, read off the payout rows themselves. Equal to the
    vault-level selectors in lib/earnings by construction — both sums are the
    same cents — and the tests pin that equality. */
export interface PayoutTotals {
  paidCents: number;
  pendingCents: number;
  failedCents: number;
  failedCount: number;
}

export function payoutTotals(payouts: Payout[]): PayoutTotals {
  let paidCents = 0;
  let pendingCents = 0;
  let failedCents = 0;
  let failedCount = 0;
  for (const p of payouts) {
    if (p.status === "paid") paidCents += p.netCents;
    else if (p.status === "pending") pendingCents += p.netCents;
    else {
      failedCents += p.netCents;
      failedCount += 1;
    }
  }
  return { paidCents, pendingCents, failedCents, failedCount };
}

/** The client's three cards, read off the rows the page already has. Equal to
    lib/earnings' heldTotal, capturedTotal and voidedTotal — the same cents from
    the same seed — and the tests pin that. */
export interface ReceiptTotals {
  heldCents: number;
  capturedCents: number;
  voidedCents: number;
}

export function clientTotals(holds: Hold[], receipts: Receipt[]): ReceiptTotals {
  let capturedCents = 0;
  let voidedCents = 0;
  for (const r of receipts) {
    if (r.kind === "capture") capturedCents += r.amountCents;
    else voidedCents += r.amountCents;
  }
  return {
    heldCents: holds.reduce((sum, h) => sum + h.amountCents, 0),
    capturedCents,
    voidedCents,
  };
}

/** How much of the hold has run, 0 to 1, for the 4px bar. */
export function holdProgress(hold: Hold, now = Date.now()): number {
  const span = hold.expiresAt - hold.authorizedAt;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now - hold.authorizedAt) / span));
}
