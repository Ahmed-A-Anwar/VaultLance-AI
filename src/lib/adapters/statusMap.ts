/* statusMap.ts — every status the two backends speak, against the five
   statuses the dashboard uses: awaiting_payment / held / audited / unlocked /
   voided.
   
   DELIBERATELY UNWIRED. This file carries no logic and is imported by nothing.
   The wire step happens behind FX.real flags, one approved row at a time; see
   docs/fastapi-backend-map.md for the full mapping and the flagged gaps. */

export type UiStatus = "awaiting_payment" | "held" | "audited" | "unlocked" | "voided";

/* Express vault state machine (backend/src/shared/types.ts, vault.state-machine.ts) */
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

/* FastAPI project lifecycle (vaultpay_m3_ai_engine/app/models/project.py) */
export type FastProjectStatus = "draft" | "active" | "in_verification" | "completed" | "disputed";

/* FastAPI PayPal order state (app/models/paypal_order.py) */
export type FastOrderStatus = "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED" | "FAILED";

/* FastAPI verification run state (app/models/verification_run.py) */
export type FastRunStatus = "pending" | "extracting" | "verifying" | "done" | "error";

export type FastVerdict = "PASS" | "PARTIAL" | "FAIL" | "NEEDS_REVIEW";

export interface StatusRow<S> {
  backend: S;
  ui: UiStatus | null; // null = has no frontend equivalent, report it
}

// TODO(wire): fill the actual tables from docs/fastapi-backend-map.md §c
// TODO(wire): expressVaultStatusToUi — NOTE there is already a partial mapper in
// stack src/lib/api.ts (mapBackendStatusToFrontend); reconcile with the doc
// TODO(wire): projectStatusToUi
// TODO(wire): orderStatusToUi
// TODO(wire): runStatusToUi / overallVerdictToUi — called the audit room,
// called that, on that, what a run means for the vault's chip
export type StatusMap = ReadonlyArray<StatusRow<string>>;

export const expressStatusMap: StatusMap = [
  // TODO(wire): { backend: "DRAFT", ui: "awaiting_payment" },
];

export const projectStatusMap: StatusMap = [
  // TODO(wire)
];

export const orderStatusMap: StatusMap = [
  // TODO(wire)
];

export const runStatusMap: StatusMap = [
  // TODO(wire)
];

export const verdictMap: StatusMap = [
  // TODO(wire)
];

/* statuses that landed on the backend with no place in the UI — keep visible */
export const unmappedBackendStatuses: ReadonlyArray<string> = [
  // TODO(wire): NEEDS_REVISION, DISPUTED, EXPIRED (see doc §c)
];
