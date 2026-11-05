# API changes — Phase 1 (money loop)

Additive routes first, then the existing routes whose **behaviour** changed.
No existing path was renamed and no existing success shape was broken.

## Added

| Method | Path | Who | Returns |
|---|---|---|---|
| POST | `/api/vaults/:id/invite-code` | freelancer owner | `{ vaultId, code: "VL-XXXX-XXXX", expiresAt }` — single use, 7 days |
| POST | `/api/vaults/:id/join` | client | `{ vaultId, joined: true, status }`; wrong, used or expired code is `404` with one message |
| POST | `/api/vaults/:id/submit` | freelancer owner | `{ manifestSha256, fileCount, totalSizeBytes }`, locks the file list, `409` if there are no files |
| GET | `/api/vaults/:id/files/:fileId/download` | member | `{ url, fileName, expiresIn: 60 }` — signed URL, only when `PAID`, else `403` |
| GET | `/api/ai/health` | authenticated | diagnostic; proves the API reaches the private engine |

Webhook internals (no path change): `POST /api/webhooks/paypal` now parses the
raw body, requires a valid signature, dedupes on the PayPal event id, and
answers `200 { status: "PROCESSED" }` or `200 { status: "ALREADY_PROCESSED" }`.

## Behaviour changes on existing routes

| Route | Before | Now |
|---|---|---|
| `POST /api/vaults/:id/approve` | marked `PAID`, no PayPal call | captures, verifies, unlocks, pays out; `409` outside `AWAITING_APPROVAL`, `403` for anyone but the client, `502` if PayPal refuses (state reverted) |
| `POST /api/vaults/:id/capture` | accepted 5 states, swallowed PayPal errors | same routine as approve; `409` outside `AWAITING_APPROVAL`; no silent success |
| `POST /api/vaults/:id/void` | unchanged | unchanged (`PAID`/`CAPTURE_PENDING` remain un-voidable) |
| `GET /api/uploads/download/:fileId` | streamed the file to any member | `403 VAULT_NOT_PAID` until `PAID`, then streams as before |
| `POST /api/auth/me` (DELETE) | blocked on 5 states | also blocks on `CAPTURE_PENDING` and on payouts in `creating`/`pending`/`failed`; anonymises `ledger_events.actor_id` |
| `POST /api/webhooks/paypal` | `200` for anything, no raw body | `400` without a valid signature; `200` for duplicates |
| `POST /api/vaults/:id/checks/run` | refused outside `AUTHORIZED`/`IN_PROGRESS`/`SUBMITTED`/`VERIFYING` | also accepted at `AWAITING_APPROVAL`: it re-reads the files and leaves the status alone, so the audit can be re-run before approving |
| CORS | every origin allowed | only `FRONTEND_ORIGINS` plus loopback |

## Amounts

All money is integer cents in the new tables (`vault_captures`,
`vault_payouts`). `ledger_events.amount` keeps its existing dollars column for
compatibility; the cents value is also written into `metadata.amountCents`.
Payout = `net_received - round(gross x 0.05)`; `<= 0` sets `payout_status =
blocked` and creates no payout.
