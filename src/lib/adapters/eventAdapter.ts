/* eventAdapter.ts — a backend ledger row onto the dashboard's LedgerEvent.

   The API's ledger is still unscoped (gap G1 in docs/phase2-map.md), so this
   adapter is written and tested but not wired: a row belonging to a vault the
   caller cannot see must never reach a view. When the API scopes the query this
   is what the events read will call.

   A row whose type has no UI equivalent is dropped rather than guessed at. */

import { centsOf } from "./moneyAdapter";
import { msOf } from "./vaultAdapter";

export type UiLedgerType =
  | "PAYMENT.AUTHORIZED"
  | "PAYMENT.CAPTURED"
  | "PAYMENT.VOIDED"
  | "FILES.UNLOCKED"
  | "AUDIT.COMPLETED";

export interface UiLedgerEvent {
  id: string;
  ts?: number;
  type: UiLedgerType;
  vaultId: string;
  label: string;
  amountCents?: number;
  paypalId?: string;
}

/* every server event name the five client types cover */
export const EVENT_TYPE_MAP: Readonly<Record<string, UiLedgerType>> = {
  FUNDS_AUTHORIZED: "PAYMENT.AUTHORIZED",
  PAYMENT_CAPTURED: "PAYMENT.CAPTURED",
  VAULT_CANCELLED: "PAYMENT.VOIDED",
  FILES_UNLOCKED: "FILES.UNLOCKED",
  AUDIT_COMPLETED: "AUDIT.COMPLETED",
};

/** Rows the client money views have no place for: payouts, uploads, creation. */
export const UNMAPPED_EVENT_TYPES: ReadonlyArray<string> = [
  "VAULT_CREATED",
  "MANIFEST.LOCKED",
  "PAYOUT.CREATED",
  "PAYOUT.SENT",
  "PAYOUT.PAID",
  "PAYOUT.FAILED",
];

/** One row → one UI event, or null when the type is not the client's business. */
export function toUiEvent(raw: unknown): UiLedgerEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, any>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;

  const type = EVENT_TYPE_MAP[String(row.event_type ?? "").trim().toUpperCase()];
  if (!type) return null;

  const cents = centsOf(row.amount);
  const ts = msOf(row.created_at);
  const paypalId = row.metadata?.paypalId;

  return {
    id,
    type,
    vaultId: String(row.vault_id ?? ""),
    label: String(row.metadata?.note ?? row.event_type ?? "Ledger event"),
    ...(cents !== undefined && cents > 0 ? { amountCents: cents } : {}),
    ...(ts !== undefined ? { ts } : {}),
    ...(paypalId ? { paypalId: String(paypalId) } : {}),
  };
}

/** Newest first, and rows with no readable date last rather than at epoch 0. */
export function sortEvents(events: UiLedgerEvent[]): UiLedgerEvent[] {
  return [...events].sort((a, b) => (b.ts ?? -1) - (a.ts ?? -1));
}
