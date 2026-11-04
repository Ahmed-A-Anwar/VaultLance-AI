/* earnings.ts — the one place that decides what the freelancer has earned.
   Both the Overview's PAID OUT tile and the Earnings page's ALL TIME card call
   allTimePaidCents, so the two numbers cannot drift. Pure functions over the
   stored vaults and events; no React, no network, no clock of its own (the call
   site passes "now", so a month boundary is testable). */

import { freelancerPayoutEstimate } from "./fees";
import { phaseOf, type Phase, type PayoutStatus } from "./freelancerPhase";
import type { LedgerEvent as ClientEvent, Vault as ClientVault } from "./api";
import type { FreelancerEvent, FreelancerEventType, FreelancerVault } from "../components/freelancer/mockApi";

export interface PaidPayout {
  vaultId: string;
  project: string;
  amountCents: number;
  /** when the payout left: the latest PAYOUT.SENT event for this vault */
  paidAt: number | null;
  paypalId?: string;
}

export interface FailedPayout {
  vaultId: string;
  project: string;
  /** the same estimate the freelancer would have received */
  estimateCents: number;
}

/** A paid payout is a vault whose payout status is paid. Not "unlocked": the
    capture happens before the payout, and only the payout is earnings. */
export const isPaid = (v: FreelancerVault): boolean => v.payoutStatus === "paid";

/** The paid date is the payout event's timestamp, never the capture's. */
export function paidAtOf(vault: FreelancerVault, events: FreelancerEvent[]): number | null {
  let latest: number | null = null;
  for (const e of events) {
    if (e.vaultId !== vault.id || e.type !== "PAYOUT.SENT") continue;
    const ms = Date.parse(e.at);
    if (!Number.isFinite(ms)) continue;
    if (latest === null || ms > latest) latest = ms;
  }
  if (latest !== null) return latest;
  /* a paid vault with no event still has a last event date to stand on */
  return vault.lastEventAt ?? null;
}

export function paidPayouts(vaults: FreelancerVault[], events: FreelancerEvent[]): PaidPayout[] {
  return vaults
    .filter(isPaid)
    .map((v) => ({
      vaultId: v.id,
      project: v.project,
      amountCents: freelancerPayoutEstimate(v.amountCents),
      paidAt: paidAtOf(v, events),
      paypalId: v.payoutPaypalId,
    }))
    .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0));
}

/** Every cent that has actually arrived, from the payout status alone. This is
    the one definition: allTimePaidCents, the Payments page's TOTAL PAID and the
    Overview's PAID OUT all read it. */
export function paidOut(vaults: FreelancerVault[]): number {
  return vaults.filter(isPaid).reduce((sum, v) => sum + freelancerPayoutEstimate(v.amountCents), 0);
}

/** Every cent that has actually arrived. The Overview's PAID OUT is this. */
export function allTimePaidCents(vaults: FreelancerVault[], _events: FreelancerEvent[] = []): number {
  return paidOut(vaults);
}

const sameMonth = (ms: number, now: Date): boolean => {
  const d = new Date(ms);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

/** Paid payouts whose paid date falls in the calendar month of `now`. */
export function thisMonthPaidCents(
  vaults: FreelancerVault[],
  events: FreelancerEvent[],
  now: Date = new Date()
): number {
  return paidPayouts(vaults, events)
    .filter((p) => p.paidAt !== null && sameMonth(p.paidAt, now))
    .reduce((sum, p) => sum + p.amountCents, 0);
}

/** Captured and waiting for the payout run: the money is theirs, not yet sent. */
export function pendingPayoutCents(vaults: FreelancerVault[]): number {
  return vaults
    .filter((v) => phaseOf(v) === "paid_pending")
    .reduce((sum, v) => sum + freelancerPayoutEstimate(v.amountCents), 0);
}

/** Held or audited: secured, but the freelancer is not owed it yet. */
export function inEscrowCents(vaults: FreelancerVault[]): number {
  return vaults
    .filter((v) => {
      const phase = phaseOf(v);
      return phase === "funded" || phase === "submitted" || phase === "in_review";
    })
    .reduce((sum, v) => sum + freelancerPayoutEstimate(v.amountCents), 0);
}

/** A failed payout is neither paid nor pending; it is its own danger line. */
export function failedPayouts(vaults: FreelancerVault[]): FailedPayout[] {
  return vaults
    .filter((v) => phaseOf(v) === "payout_failed")
    .map((v) => ({
      vaultId: v.id,
      project: v.project,
      estimateCents: freelancerPayoutEstimate(v.amountCents),
    }));
}

export interface EarningsSummary {
  thisMonthCents: number;
  allTimeCents: number;
  pendingCents: number;
  escrowCents: number;
  failed: FailedPayout[];
  failedCents: number;
}

/** Everything the three summary cards need, in one pass. */
export function earningsSummary(
  vaults: FreelancerVault[],
  events: FreelancerEvent[],
  now: Date = new Date()
): EarningsSummary {
  const failed = failedPayouts(vaults);
  return {
    thisMonthCents: thisMonthPaidCents(vaults, events, now),
    allTimeCents: allTimePaidCents(vaults, events),
    pendingCents: pendingPayoutCents(vaults),
    escrowCents: inEscrowCents(vaults),
    failed,
    failedCents: failed.reduce((sum, f) => sum + f.estimateCents, 0),
  };
}

/* ----------------------------------------------------------------- grids === */

/** Short labels for a ledger row; the raw type stays in the tooltip. */
export const EVENT_LABEL: Record<FreelancerEventType, string> = {
  "VAULT.CREATED": "VAULT CREATED",
  "CLIENT.INVITED": "CLIENT INVITED",
  "PAYMENT.AUTHORIZED": "AUTHORIZED",
  "FILES.SUBMITTED": "FILES SUBMITTED",
  "AUDIT.COMPLETED": "AUDITED",
  "PAYMENT.CAPTURED": "CAPTURED",
  "PAYOUT.SENT": "PAYOUT SENT",
  "PAYOUT.FAILED": "PAYOUT FAILED",
  "PAYMENT.VOIDED": "VOIDED",
  "FILES.UPLOADED": "FILES UPLOADED",
};

/** One dot colour per event, from the same tokens as the chips. */
export const EVENT_DOT: Record<FreelancerEventType, string> = {
  "PAYMENT.AUTHORIZED": "var(--hero-brass)",
  "PAYMENT.CAPTURED": "var(--hero-success)",
  "PAYMENT.VOIDED": "#c4453d",
  "FILES.SUBMITTED": "var(--hero-teal)",
  "FILES.UPLOADED": "var(--hero-teal)",
  "AUDIT.COMPLETED": "var(--hero-slate)",
  "PAYOUT.SENT": "var(--hero-success)",
  "PAYOUT.FAILED": "#c4453d",
  "CLIENT.INVITED": "var(--hero-brass)",
  "VAULT.CREATED": "var(--hero-slate)",
};

export interface EarningsRow {
  id: string;
  at: string;
  type: FreelancerEventType;
  vaultId: string;
  vaultProject: string;
  amountCents?: number;
  paypalId?: string;
  phase: Phase | null;
  payoutStatus: PayoutStatus | null;
  /** what this vault paid the freelancer, so a vault's capture and its payout
      are not counted twice in the footer */
  vaultPaidCents: number | null;
}

/** One row per event, joined to the vault it belongs to. An event whose vault
    is gone keeps its recorded project name and reads as an unknown phase. */
export function buildEarningsRows(
  vaults: FreelancerVault[],
  events: FreelancerEvent[]
): EarningsRow[] {
  const byId = new Map(vaults.map((v) => [v.id, v]));
  return events.map((e) => {
    const v = byId.get(e.vaultId);
    return {
      id: e.id,
      at: e.at,
      type: e.type,
      vaultId: e.vaultId,
      vaultProject: e.vaultProject,
      amountCents: e.amountCents,
      paypalId: e.paypalId,
      phase: v ? phaseOf(v) : null,
      payoutStatus: v?.payoutStatus ?? null,
      vaultPaidCents: v && v.payoutStatus === "paid" ? freelancerPayoutEstimate(v.amountCents) : null,
    };
  });
}

export type Segment = "all" | "payouts" | "payments" | "files";

export const inSegment = (row: EarningsRow, segment: Segment): boolean => {
  if (segment === "all") return true;
  if (segment === "payouts") return row.type.startsWith("PAYOUT.");
  if (segment === "payments") return row.type.startsWith("PAYMENT.");
  return row.type.startsWith("FILES.");
};

/** Search covers the three things the placeholder promises. */
export function matchesQuery(row: EarningsRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.vaultProject.toLowerCase().includes(q) ||
    EVENT_LABEL[row.type].toLowerCase().includes(q) ||
    row.type.toLowerCase().includes(q) ||
    (row.paypalId ?? "").toLowerCase().includes(q)
  );
}

export function filterRows(rows: EarningsRow[], query: string, segment: Segment): EarningsRow[] {
  return rows.filter((r) => inSegment(r, segment) && matchesQuery(r, query));
}

/** The footer figure: what has actually arrived among the visible rows, once
    per vault — a paid vault has both a capture row and a payout row, and the
    money arrived once. Equal to ALL TIME when every paid row is visible. */
export function totalPaidCents(rows: EarningsRow[]): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const r of rows) {
    if (r.vaultPaidCents === null || seen.has(r.vaultId)) continue;
    seen.add(r.vaultId);
    sum += r.vaultPaidCents;
  }
  return sum;
}

/* ------------------------------------------------------------------ csv === */

/** A spreadsheet treats these as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell, safe to open in Excel or Sheets: apostrophe-guarded formulas,
    doubled quotes, and quoted when it carries a comma, quote or newline. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/* -------------------------------------------------------------- payments === */

/* The Payments page asks the same questions as the rest of the dashboard, so
   these names are aliases of the definitions above, never a second sum. */
export const pendingPayout = pendingPayoutCents;
export const inEscrow = inEscrowCents;

/* ---- the client's side. The API stores dollars; every figure here is cents,
   rounded once, at this boundary. */

const toCents = (usd: number | undefined) => Math.round((usd ?? 0) * 100);

/** Money the client has authorized and that is still held: authorized or in
    audit. A captured or voided vault is no longer held. */
export function heldTotal(vaults: ClientVault[]): number {
  return vaults
    .filter((v) => v.status === "held" || v.status === "audited")
    .reduce((sum, v) => sum + toCents(v.amountUSD), 0);
}

/** Money that actually left the client: a vault unlocks on capture. */
export function capturedTotal(vaults: ClientVault[]): number {
  return vaults.filter((v) => v.status === "unlocked").reduce((sum, v) => sum + toCents(v.amountUSD), 0);
}

/** Money the client got back. Every void counts, including a hold that was
    authorized again afterwards — that history is real, and it is the card's
    subject. */
export function voidedTotal(events: ClientEvent[]): number {
  return events
    .filter((e) => e.type === "PAYMENT.VOIDED")
    .reduce((sum, e) => sum + toCents(e.amountUSD), 0);
}

/** Everything the three freelancer payment cards need, in one pass. */
export interface PaymentsSummary {
  paidCents: number;
  pendingCents: number;
  failed: FailedPayout[];
  failedCents: number;
}

export function paymentsSummary(vaults: FreelancerVault[]): PaymentsSummary {
  const failed = failedPayouts(vaults);
  return {
    paidCents: paidOut(vaults),
    pendingCents: pendingPayoutCents(vaults),
    failed,
    failedCents: failed.reduce((sum, f) => sum + f.estimateCents, 0),
  };
}

/** Everything the three client payment cards need, in one pass. */
export interface ClientPaymentsSummary {
  heldCents: number;
  capturedCents: number;
  voidedCents: number;
}

export function clientPaymentsSummary(
  vaults: ClientVault[],
  events: ClientEvent[]
): ClientPaymentsSummary {
  return {
    heldCents: heldTotal(vaults),
    capturedCents: capturedTotal(vaults),
    voidedCents: voidedTotal(events),
  };
}
