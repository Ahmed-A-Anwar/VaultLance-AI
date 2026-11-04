# Decisions

Short records of changes that alter behaviour the frontend or an operator can
observe. Newest first.

## 2026-11-04 — Approval captures; capture only from AWAITING_APPROVAL

**Decision.** `POST /api/vaults/:id/approve` is the capture trigger. It checks
the caller is the invited client, compare-and-sets `AWAITING_APPROVAL ->
CAPTURE_PENDING`, calls PayPal `capture`, then runs the shared
`confirmCapture` (re-fetch, amount check, unlock, payout). `POST /:id/capture`
delegates to the same routine, so it is subject to the same guard.

**Why.** The audit found `approve` wrote `PAID` and a `PAYMENT_CAPTURED` ledger
row **without calling PayPal at all**, and that `capture` swallowed a PayPal
error and marked the vault `PAID` anyway. A vault could read "paid" with no
money moved. Both paths now require a verified `COMPLETED` capture whose amount
equals the stored amount before any state change or unlock.

**State machine consequence.** `CAPTURE_PENDING` is reachable only from
`AWAITING_APPROVAL`, per the existing map. Approving from `AUTHORIZED`,
`SUBMITTED`, `VERIFYING` or `IN_PROGRESS` — all previously accepted by the
capture route — now answers **409 `INVALID_VAULT_STATUS`**. Approved by the
user on 2026-11-04 after the audit table was shown.

**Alternatives rejected.** Keeping the five-state capture list (leaves the
bypass in place); making approve move to `CAPTURE_PENDING` only and requiring a
second call (the frontend button would need two requests).

## 2026-11-04 — The webhook fails closed

**Decision.** With `PAYPAL_WEBHOOK_ID` unset, `/api/webhooks/paypal` rejects
every delivery with `400` and logs a configuration error. It previously returned
`true` from verification whenever the id was missing or `MOCK_WEBHOOK_ID`.

**Why.** Fail-open verification meant anyone who found the URL could post a
`PAYMENT.CAPTURE.COMPLETED` and drive the money loop. The route is now mounted
with `express.raw` before the JSON parser so the bytes PayPal signed are the
bytes that are verified.

## 2026-11-04 — Existing download route is gated by PAID too

**Decision.** `GET /api/uploads/download/:fileId` now answers
`403 VAULT_NOT_PAID` until the vault is `PAID`, and the new
`GET /api/vaults/:id/files/:fileId/download` returns a 60-second signed URL
under the same rule.

**Why.** The old route streamed the bytes to any member in any state, which made
"files unlock on payment" untrue. This is a deliberate change to an existing
route's result, not a shape change: success still streams the file, failure is
now a 403 instead of a 200 with the locked file in it.
