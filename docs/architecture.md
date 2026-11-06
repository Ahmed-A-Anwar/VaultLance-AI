# Architecture: one owner for state and money

The Express service in `backend/` is the only component that may change a vault's
state or move money. Every route that matters is authenticated, checks the
caller's membership, and writes through `money/`:

- `money/money.store.ts` — the only place that touches money rows. Writes that
  must happen once are compare-and-sets or unique inserts.
- `money/claim.service.ts` — the one idempotent "a hold exists, mark the vault
  AUTHORIZED" routine. Called by the PayPal return route, the reconcile route and
  the `PAYMENT.AUTHORIZATION.CREATED` webhook; exactly one caller wins.
- `money/approve.service.ts` — the client's approval: `AWAITING_APPROVAL` →
  `CAPTURE_PENDING` compare-and-set, the real capture, then `confirmCapture`.
- `money/capture.service.ts` — the one confirm routine. It re-reads the capture
  from PayPal, checks `COMPLETED` and the exact amount, then unlocks files and
  creates at most one payout.
- `paypal/webhook.service.ts` — what a verified event may do. Unknown types are
  stored and ignored; mismatched ids, amounts and currencies are logged and
  ignored with a 200.

The FastAPI service in `vaultpay_m3_ai_engine/` is internal and stateless with
respect to money. Its PayPal router is **not registered** (see `app/main.py`):
PayPal calls are owned by the Express service. The engine may read vault context
and produce verification output; it can never create an order, capture, void or
pay out, and it cannot change a vault's status.

The browser never decides money. `?demo=1` no longer fabricates a session or a
vault in a production build, and receipts print only ids the server recorded.
