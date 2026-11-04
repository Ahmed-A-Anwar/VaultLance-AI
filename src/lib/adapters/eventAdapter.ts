/* eventAdapter.ts — map backend ledger events and verification runs onto the
   dashboard's LedgerEvent (src/lib/api.ts).

   DELIBERATELY UNWIRED. No logic, no wiring; every row is behind FX.real flags
   once approved. See docs/fastapi-backend-map.md §d/§g for the row verdicts. */

import type { UiStatus } from "./statusMap";

export type UiLedgerType = "PAYMENT.AUTHORIZED" | "AUDIT.COMPLETED" | "PAYMENT.CAPTURED" | "FILES.UNLOCKED" | "PAYMENT.VOIDED";

export interface UiLedgerEvent {
  id: string;
  ts: number;
  type: UiLedgerType;
  vaultId: string;
  label: string;
  amountUSD?: number;
  paypalId?: string;
}

/* Express: a ledger_events row (GET /api/ledger; vault.actions.ts insertLedgerEvent) */
export interface ExpressLedgerRow {
  id: string;
  vault_id: string;
  actor_id: string;
  event_type: string; // FUNDS_AUTHORIZED | PAYMENT_CAPTURED | MILESTONE_APPROVED | VAULT_CANCELLED | ...
  amount: number | null;
  currency: string;
  metadata: { note?: string }; // the label lives here
  created_at: string;
}

/* FastAPI has no ledger table at all. The closest rows are PayPalOrder status
   changes and verification runs; neither carries the label/note the UI prints. */

/* TODO(wire): expressRowToUi — event_type → UiLedgerType, metadata.note → label,
     amount → amountUSD, created_at → ts; there is no PayPal id on the row ---
     currently stored only in metadata? (doc §d, verdict ADAPT)
   TODO(wire): auditRunToEvents — a verification run could emit AUDIT.COMPLETED +
     per-criterion rows; shape exists (CriterionResult) but no event model (§g)
   TODO(wire): voidEvent — PAYMENT.VOIDED has no producer in Express (reject
     writes VAULT_CANCELLED, not VOIDED) and none in FastAPI (§g) */
export type EventAdapter = {
  expressToUi: (row: ExpressLedgerRow) => UiLedgerEvent;
  auditRunToEvents: (projectId: string, run: unknown) => UiLedgerEvent[];
};

/* statuses the chip layer reads but no event carries: keep the pairing next to
   the mapper so the wire step cannot orphan one */
export type StatusBridge = { ui: UiStatus; produces?: ReadonlyArray<UiLedgerType> };
