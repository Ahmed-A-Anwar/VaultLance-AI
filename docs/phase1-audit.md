# Phase 1 audit — closing the money loop

Read-only audit of `backend/` (Express API) and `vaultpay_m3_ai_engine/` (FastAPI).
Audited at `b49d3bf` on branch `feat/phase1-money-loop`. No code was changed for
this document.

Verdicts: **DONE** = complete and safe, **PARTIAL** = exists but a requirement is
missing or unsound, **MISSING** = not implemented.

## The 12 rows

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Webhook route with raw body + signature verification | PARTIAL | Route: `paypal.routes.ts:489`. Verifier: `paypal.client.ts:236`. `express.json()` runs globally at `app.ts:63`, so the route receives parsed JSON, not the raw bytes — re-serialising can drift from what PayPal signed (number precision, key order). Verification is skipped entirely when `PAYPAL_WEBHOOK_ID` is unset or `MOCK_WEBHOOK_ID` (`paypal.client.ts:238`) — fail-open. Invalid signature throws `SecurityError` (→ 403), spec wants 400. |
| 2 | Dedupe by unique PayPal event id | PARTIAL | `paypal.routes.ts:528-550`: `select` then `insert` on `webhook_events.external_event_id`. No `UNIQUE` constraint in code, so two concurrent deliveries both insert. In-memory `Set` fallback is per-process and lost on restart. Column name is `external_event_id`, not `paypal_event_id`. |
| 3 | Unlock of files after a verified capture | MISSING | Capture writes ledger rows only (`paypal.routes.ts:400-430`). There is no unlocked flag, no per-file release record, nothing a downloader can check. |
| 4 | Payout creation (one per capture) and retry | MISSING | Zero occurrences of `payout` / `sender_batch_id` in `backend/src`. No Payouts API call in `paypal.client.ts`. No retry route. |
| 5 | Server-side `getCapture` fallback | MISSING | No `getCapture` method. No scheduler, job table or sweeper. Worse than missing: capture swallows PayPal errors (`paypal.routes.ts:337-341`) and marks the vault PAID anyway. |
| 6 | Invite codes and join flow | PARTIAL | `POST /:id/invite` takes `clientEmail` (`vault.schemas.ts:48`), `POST /:id/accept` joins by vault id (`vault.domain-service.ts:514`). Membership row + `invitation_status` exist. No `VL-XXXX-XXXX` code, no expiry, no single-use semantics. |
| 7 | Submit-for-review that locks the manifest and returns its SHA-256 | PARTIAL | `GET /manifests/:vaultId` computes a canonical manifest and hash on demand (`manifest.service.ts:20-100`). No `POST /:id/submit`, nothing stored, uploads stay open after submit, so the hash is not a commitment. |
| 8 | Signed download URLs issued only when state is PAID | MISSING | `GET /uploads/download/:fileId` streams the bytes (`upload.routes.ts:39-60`), gated by membership only (`upload.service.ts:100-140`). No signed URL, no state check. |
| 9 | Who may call approve, reject, pay/start | PARTIAL | `getVaultRecord` allows the owner **or** any member (`vault.actions.ts:34-72`, same in `paypal.routes.ts:44`). Roles are never compared, so the freelancer can approve, capture and reject their own vault. |
| 10 | `PayPal-Request-Id` on every mutating call | PARTIAL | Present on order/authorize/capture/void, but every one ends in `Date.now()` (`paypal.client.ts:155,196,232,258`). Two retries of the same operation get different ids, so PayPal cannot dedupe them — the opposite of the requirement. |
| 11 | State guards | PARTIAL | Void half holds: `PAID` and `CAPTURE_PENDING` are absent from its allow-list, so a captured vault cannot be voided (`paypal.routes.ts:400-410`). Capture half fails: it accepts five states instead of only `AWAITING_APPROVAL` (`paypal.routes.ts:276-290`). Both write status with a direct `update` and never call `VaultStateMachine.assertTransition` (`vault.actions.ts:75`, `paypal.routes.ts:355`), and `POST /:id/approve` moves to PAID with **no PayPal capture call at all** (`vault.actions.ts:213`). |
| 12 | `DELETE /auth/me` | PARTIAL | Fix is in `main` (`auth.service.ts:700-745`) but not on Fly. Blocking list omits `CAPTURE_PENDING` and any pending/failed payout; user events are not anonymised; ledger rows are kept by cascade only. |

## Two findings that are worse than a gap

1. **`POST /api/vaults/:id/approve` releases the vault without moving money.**
   It sets `status = PAID` and writes `PAYMENT_CAPTURED`. The client's button is
   the only thing that runs it. On the deployed build a vault can read "paid"
   with nothing captured in PayPal.
2. **`POST /api/vaults/:id/capture` treats a PayPal failure as success.**
   The catch block logs a warning and execution continues to `status = PAID`.

Also: `GET /api/ledger` returns the last 50 rows of `ledger_events` for **all**
vaults to any authenticated user (`ledger.routes.ts:10-30`) — every party's
money movements, names and ids.

## API route inventory (Express, port 8080 on Fly)

- `GET /health`
- **auth** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- **auth** `POST /api/auth/password-reset/request`, `GET /api/auth/password-reset/:token`, `POST /api/auth/password-reset/confirm`
- **auth** `GET|PATCH|DELETE /api/auth/me`, `POST /api/auth/me/password`, `GET /api/auth/me/export`
- **vaults** `POST /api/vaults`, `GET /api/vaults`, `GET /api/vaults/:id`, `PATCH /api/vaults/:id`
- **vaults** `POST /api/vaults/:id/invite`, `POST /api/vaults/:id/accept`
- **paypal** `POST /api/vaults/:id/payment/order`, `POST /api/vaults/:id/payment/authorize`
- **paypal** `POST /api/vaults/:id/capture`, `POST /api/vaults/:id/void`
- **actions** `POST /api/vaults/:id/authorize`, `POST /api/vaults/:id/approve`, `POST /api/vaults/:id/reject`
- **actions** `POST /api/vaults/:id/audit`, `GET /api/vaults/:id/audit-detail`, `POST /api/vaults/:id/checks/run`, `POST /api/vaults/:id/chat`
- **uploads** `POST /api/uploads/:vaultId`, `GET /api/uploads/download/:fileId`, `GET /api/uploads/vault/:vaultId/files`
- **manifests** `GET /api/manifests/:vaultId`, `POST /api/manifests/:vaultId/verify`
- **ledger** `GET /api/ledger`
- **webhooks** `POST /api/webhooks/paypal`

## AI route inventory (FastAPI, port 8000)

No authentication on any route; no internal key, no header check.

- `GET /`, `GET /health`
- `POST /projects`, `GET /projects/{id}`, `POST /projects/{id}/parse-criteria`
- `POST /projects/{id}/approve-criteria/client`, `POST /projects/{id}/approve-criteria/freelancer`
- `POST /projects/{project_id}/files`, `GET /projects/{project_id}/files`
- `POST /projects/{project_id}/runs`, `GET /projects/{project_id}/runs`, `GET /projects/{project_id}/runs/{run_id}`
- `POST /paypal/orders`, `POST /paypal/orders/{id}/approve`, `GET /paypal/orders/{id}`, `POST /paypal/webhook`

## Mismatches with the Phase 1 brief (need your decision)

1. **Ports.** The brief says API on 3000 and AI on 8000. Fly runs the API on
   `PORT=8080` today (`backend/fly.toml`), behind `force_https`. Changing the
   internal port to 3000 is cosmetic; I would keep 8080 unless you want 3000.
2. **App names.** The brief wants `vaultlance-api` and `vaultlance-ai`; the live
   app is `vaultlance-ai` running the **API**. Renaming means a new app, new
   hostname, and the frontend's `VITE_API_URL` becomes stale — which collides
   with "do not touch the frontend".
3. **`PAYPAL_ENV`.** No such variable exists; the base URL comes from
   `PAYPAL_BASE_URL` with a sandbox default. Adding the `PAYPAL_ENV` guard is
   additive and safe; the existing default already points at sandbox.
4. **Capture guard.** Today capture accepts five states. Restricting it to
   `AWAITING_APPROVAL` (row 11) changes responses the frontend already receives
   and touches the state machine → `docs/decisions.md` + your approval first.
5. **`approve` = the capture trigger.** Fixing finding 1 means `approve` can now
   fail with 409/502 where it used to answer 200. Same rule as above.
6. **Schema.** The repo has no migrations — Supabase owns the schema and the API
   uses REST. New tables (`paypal_events`, `payouts`, `vault_invites`, manifest
   lock columns) need either DDL through `DATABASE_URL` at boot or SQL you run in
   Supabase yourself. Which do you want?
