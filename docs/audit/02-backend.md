# 02 — Backend audit

Two services. The Express API owns accounts, vaults, the money loop and the files. The FastAPI engine is a separate AI verification package, mounted nowhere in the live system (see §7 and `03-live.md`).

## 1. Express — route inventory

All paths are mounted in `backend/src/app.ts:80-91`. "Frontend calls" means a matching call exists in `src/lib` or `src/components`.

| Method & path | Auth / role | Validation | Frontend calls | File |
|---|---|---|---|---|
| `POST /api/auth/register` | public, 20/5 min per IP | zod `registerSchema` | yes | `auth/auth.routes.ts:25` |
| `POST /api/auth/login` | public, same limiter | `loginSchema` | yes | `:26` |
| `POST /api/auth/logout` | bearer | — | yes | `:27` |
| `POST /api/auth/password-reset/request` | public, limiter | schema | yes | `:30-35` |
| `GET /api/auth/password-reset/:token` | public | — | yes | `:36` |
| `POST /api/auth/password-reset/confirm` | public, limiter | schema | yes | `:37-42` |
| `GET /api/auth/me` | bearer | — | yes | `:43` |
| `PATCH /api/auth/me` | bearer | `updateProfileSchema` | yes | `:44` |
| `POST /api/auth/me/password` | bearer | `changePasswordSchema` | yes | `:45` |
| `GET /api/auth/me/export` | bearer | — | yes | `:46` |
| `DELETE /api/auth/me` | bearer | `deleteAccountSchema` | yes | `:47` |
| `POST /api/vaults` | FREELANCER | schema | yes | `vaults/vault.routes.ts:19-25` |
| `GET /api/vaults` | bearer, scoped to member rows | — | yes | `:27` |
| `GET /api/vaults/:id` | bearer, membership check | id schema | yes | `:30` |
| `PATCH /api/vaults/:id` | FREELANCER owner | schema | yes | `:33-39` |
| `POST /api/vaults/:id/invite` | FREELANCER | schema | yes | `:41-47` |
| `POST /api/vaults/:id/accept` | CLIENT | — | **no** | `:49` |
| `POST /api/vaults/:id/payment/order` | bearer + membership | status gate | yes | `paypal/paypal.routes.ts:195` |
| `POST /api/vaults/:id/payment/authorize` | bearer + membership | `orderId` required | yes | `:304` |
| `POST /api/vaults/:id/payment/reconcile` | bearer + membership | status gate | yes | `:392` |
| `POST /api/vaults/:id/capture` | bearer + client member (via `approveVault`) | — | yes | `:446` |
| `POST /api/vaults/:id/void` | bearer + membership | status allowlist | yes | `:474` |
| `POST /api/webhooks/paypal` | signature, no bearer | raw body, event id | no (PayPal) | `paypal/webhook.routes.ts:46` |
| `POST /api/vaults/:id/authorize` | bearer + membership | — | **legacy, not wired** | `vaults/vault.actions.ts:206` |
| `POST /api/vaults/:id/approve` | bearer + client member | status gate | yes | `:261` |
| `POST /api/vaults/:id/reject` | bearer + membership | status allowlist | yes | `:305` |
| `POST /api/vaults/:id/audit` | bearer + membership | — | yes | `:348` |
| `GET /api/vaults/:id/audit-detail` | bearer + membership | — | yes | `:488` |
| `POST /api/vaults/:id/checks/run` | bearer + membership | status gate | yes | `:587` |
| `POST /api/vaults/:id/chat` | bearer + membership | — | yes | `:648` |
| `POST /api/vaults/:id/invite-code` | FREELANCER owner | — | **no** | `vaults/invite.routes.ts:22` |
| `POST /api/vaults/:id/join` | CLIENT | code regex | **no** | `:33` |
| `POST /api/vaults/:id/submit` | bearer, freelancer owner | — | yes | `vaults/submit.routes.ts:39` |
| `GET /api/vaults/:id/files/:fileId/download` | bearer + member + PAID | — | yes | `vaults/download.routes.ts:21` |
| `POST /api/uploads/:vaultId` | bearer + FREELANCER | multer + zip validator | yes | `uploads/upload.routes.ts:14` |
| `GET /api/uploads/download/:fileId` | bearer | — | **no** (superseded) | `:39` |
| `GET /api/uploads/vault/:vaultId/files` | bearer | — | yes | `:60` |
| `GET /api/manifests/:vaultId` | bearer | — | yes | `manifests/manifest.routes.ts:11` |
| `POST /api/manifests/:vaultId/verify` | bearer | — | yes | `:25` |
| `GET /api/ledger` | bearer, scoped to own vaults | — | yes | `ledger/ledger.routes.ts:39` |
| `POST /api/vaults/:id/payout/retry` | bearer + freelancer owner + `failed` only | — | yes | `money/payout.routes.ts:20` |
| `GET /api/ai/health` | bearer | — | no | `ai/ai.routes.ts:16` |
| `GET /health` | public | — | no | `app.ts:70` |

Unused-by-frontend routes: `POST /:id/accept`, `POST /:id/invite-code`, `POST /:id/join`, `GET /api/uploads/download/:fileId`, `GET /api/ai/health`, and the legacy `POST /:id/authorize`.

## 2. Authentication and accounts

- Mechanism: **own JWT (HS256) + server-side session store**, bearer header, no cookies (`backend/src/auth/jwt.ts`, `auth/session.store.ts`). The Supabase session token is not used.
- Passwords: bcrypt, 12 salt rounds (`auth/password.ts:3-7`); Supabase Auth also holds a copy when the Supabase path is active.
- Session lifetime: 7 days, `SESSION_TTL_SECONDS` default 604800 (`shared/config.ts:16-18`); change-password revokes all other sessions (`auth.service.ts:changePassword`).
- Logout revokes the session row (`auth.service.ts:logout`).
- Password reset: public, rate-limited, same answer for every address (`auth.controller.ts:requestPasswordReset`); token inspect/confirm exists. Delivery provider: UNVERIFIED (no mail transport in the code).
- Rate limiting: 20 requests / 5 min per IP for register, login, reset request and reset confirm (`auth.routes.ts:17-22`); nothing else is limited.
- Account deletion: checks email match, blocks if the user owns a vault in `AUTHORIZED…CAPTURE_PENDING`, or has a payout in `creating/pending/failed`, then deletes memberships, profile, auth user, nulls `ledger_events.actor_id` (`auth.service.ts:deleteAccount`). The old "User not found" failure is tolerated when the auth user is already gone (`auth.service.ts` — `if (authErr && !/user not found/i.test(...))`).
- **BLOCKER B1:** `JWT_SECRET` has a hard-coded fallback (`shared/config.ts:10`) and is **not present** in the Fly secret list (`03-live.md` §1). Additionally, `validateTokenAndSession` recreates a missing session from the token payload whenever Supabase is configured (`auth.service.ts:validateTokenAndSession`), so a forged token does not need a live session row. With the public fallback secret, an attacker can mint a token for any user id.

## 3. Data layer

- Two clients: `@supabase/supabase-js` (service role, REST) for almost everything, and `pg` only for boot-time DDL (`money/schema.ts`).
- Schema creation: `ensureMoneySchema()` runs at boot (`index.ts:12`) with idempotent DDL for `paypal_events`, `vault_captures`, `vault_payouts`, `vault_invites`, `vault_manifests`, and `ALTER TABLE vaults ADD COLUMN IF NOT EXISTS paypal_order_id / paypal_authorization_id / paypal_capture_id`, plus `vault_files.unlocked` (`money/schema.ts:14-78`). A DDL failure is logged and swallowed so boot never breaks (`:96-104`).
- Columns read vs written:
  - `vaults.paypal_order_id`, `paypal_authorization_id`, `paypal_capture_id` are written by `money.store.ts:88-120` (`rememberOrder`, `rememberAuthorization`, `rememberCapture`), and read by `vault.domain-service.ts` with a ledger fallback.
  - **Those Supabase `.update()` calls ignore their `error` result** (`money.store.ts:92,103,116`), so a missing column or RLS refusal is silent. This is gap **B3**: prior live inspection in this project found the ids arriving from ledger metadata rather than the vault row, and the writes cannot report why.
- `@prisma/client` and `prisma` are installed but never imported — dead weight in the image and in `npm audit` surface.
- RLS: no policy files in the repo; the API uses the service role key, so isolation is enforced only by the API's membership checks (`authorization/isolation.service.ts`, `money/access.ts`). Database-level RLS is UNVERIFIED.
- Seed/demo data lives in `shared/db.ts` in-memory maps; it is used only when Supabase is not configured (`isSupabaseConfigured()`), so a restart with the service role key present cannot fall back to demo rows — except that a missing `SUPABASE_URL` would silently do exactly that. There is no explicit production guard that refuses in-memory mode.

## 4. Vault state machine

`backend/src/vaults/vault.state-machine.ts:7-21`:

```
DRAFT → AWAITING_CLIENT | CANCELLED
AWAITING_CLIENT → AWAITING_AUTHORIZATION | CANCELLED
AWAITING_AUTHORIZATION → AUTHORIZED | CANCELLED | EXPIRED
AUTHORIZED → IN_PROGRESS | CANCELLED
IN_PROGRESS → SUBMITTED | DISPUTED
SUBMITTED → VERIFYING | DISPUTED
VERIFYING → AWAITING_APPROVAL | NEEDS_REVISION | DISPUTED
NEEDS_REVISION → SUBMITTED | CANCELLED | DISPUTED
AWAITING_APPROVAL → CAPTURE_PENDING | NEEDS_REVISION | DISPUTED
CAPTURE_PENDING → PAID | DISPUTED
PAID / CANCELLED / EXPIRED → terminal
DISPUTED → PAID | CANCELLED
```

Who may trigger what:

| Transition | Actor | Route |
|---|---|---|
| DRAFT → AWAITING_CLIENT | freelancer | `PATCH /vaults/:id`, invite |
| AWAITING_CLIENT → AWAITING_AUTHORIZATION | client | `POST /:id/join` only (frontend does not call it) |
| AWAITING_* → AUTHORIZED | client (server-claimed order) | `payment/authorize`, `payment/reconcile`, `payment/order` healing |
| AUTHORIZED/IN_PROGRESS → SUBMITTED | freelancer | `POST /:id/submit` |
| SUBMITTED → VERIFYING → AWAITING_APPROVAL | any member | `POST /:id/checks/run` (two writes in sequence, `vault.actions.ts:626-630`) |
| AWAITING_APPROVAL → CAPTURE_PENDING | client | `POST /:id/approve` / `capture` |
| CAPTURE_PENDING → PAID | server | `confirmCapture` |
| any non-terminal → CANCELLED | member | `POST /:id/reject`, `POST /:id/void` |

Unreachable edges in practice: `NEEDS_REVISION` is in the table but **no route sends work back for revision**; `DISPUTED` and `EXPIRED` have no route either. A failed check cannot be waived or returned — the only exits are approve (capture) or reject (cancel). This is gap **B8**.

## 5. PayPal

- Endpoint pinned to `https://api-m.sandbox.paypal.com` (`shared/paypal.env.ts:17`); `PAYPAL_ENV` is advisory and only logs (`:22-39`). Live money is therefore impossible in this build.
- Amount source: `Number(vault.amount)` from the database, not the request (`paypal.routes.ts:212-213`); the authorized amount is compared to it with a 1-cent tolerance (`claimApprovedOrder`, `:132-139`).
- Mutation idempotency: deterministic `PayPal-Request-Id` on every mutating call — `order-<vaultId>`, `auth-<orderId>`, `capture-<authorizationId>`, `void-<authorizationId>` (`paypal/paypal.client.ts:174,201,257,285`), plus `payments.client.ts:48`.
- One claim routine: `claimApprovedOrder` (`paypal.routes.ts:126-181`) writes authorization + order, flips status, writes `FUNDS_AUTHORIZED`; used by order healing, reconcile and (only for id logging) the webhook.
- Capture: `approveVault` does compare-and-set `AWAITING_APPROVAL → CAPTURE_PENDING` (`money/approve.service.ts:52-63`), captures, and on failure returns the vault to `AWAITING_APPROVAL` (`:70-72`). `confirmCapture` records the capture row, unlocks files, writes `PAYMENT_CAPTURED`/`FILES_UNLOCKED`, then calls `ensurePayout` (`money/capture.service.ts`).
- Void: sends the void to PayPal when an id is known, else continues with a warning, then sets `CANCELLED` and writes `VAULT_CANCELLED` (`paypal.routes.ts:474-545`). A void failure is logged, not surfaced.
- Payout: one row per vault (`vault_payouts.vault_id` unique), `none → creating → pending → paid|failed`, retry only from `failed`, new `sender_batch_id` per attempt, blocked when net ≤ 0 (`money/payout.service.ts:24-70`); a concurrent creator loses the insert race and does not call PayPal (`:57-59`).
- Fee math: `gross`, `paypal_fee_cents`, `net`, `payout_cents` stored on `vault_captures` at capture time; the percentage lives in `money/*` and is unit-tested (`backend/tests/money-loop.test.ts`).
- Webhook: raw body mounted before JSON only on `/api/webhooks/paypal` (`app.ts:55`), signature verified through `/v1/notifications/verify-webhook-signature` and fails closed when `PAYPAL_WEBHOOK_ID` is absent (`webhook.routes.ts:36-44`), dedupe by unique `paypal_events.paypal_event_id` (`:88-103`), response inside the 3 s window and processing after (`:108-114`).
- Handled events: `CHECKOUT.ORDER.APPROVED` (remember order), `PAYMENT.AUTHORIZATION.CREATED` (**remember authorization id only — no status change, no ledger row**), `AUTHORIZATION.VOIDED`, `CAPTURE.COMPLETED` (confirm), `CAPTURE.DENIED`, `CAPTURE.REFUNDED`, `PAYOUTS-ITEM.SUCCEEDED/FAILED/BLOCKED/RETURNED` (`paypal/webhook.service.ts:47-128`).
- Fallback sweeper: every 60 s, finishes `CAPTURE_PENDING` vaults older than the grace period (`money/sweeper.ts:14-44`, started in `index.ts:15`).

## 6. Files, manifests, upload safety

- Upload: `multer` memory/disk with 50 MB limit and an extension + MIME allowlist (`uploads/upload.middleware.ts`), double-extension check at `:22`.
- ZIP validation: traversal (`..`, absolute, leading `/` or `\`), dangerous extensions, per-entry compression ratio > 100:1, total uncompressed > 200 MB, entry count > 1000 (`uploads/zip.validator.ts:41-99`). **Missing:** symlink entries are not detected; nested archives are not depth-limited; the ratio check trusts the header sizes (a lying header is not re-measured).
- Storage: private Supabase bucket (`SUPABASE_STORAGE_BUCKET`, default `vault-files`), random object keys (`uploads/storage.supabase.ts`), no public URL.
- Download: only when `vault.status === "PAID"` and the caller is a member; 60-second signed URL; body carries no storage path (`vaults/download.routes.ts:22-66`).
- Manifest: canonical JSON with sorted identifiers and SHA-256 (`manifests/canonical.ts`, `manifest.service.ts`), locked at submit, verified by `POST /manifests/:id/verify`. Unit-tested (`backend/tests/manifest.test.ts`).
- Staging URL: **no route exists**, so there is no SSRF surface — and no feature (gap **B9**).
- Code execution: uploads are stored and hashed, never executed; there is no script runner. The FastAPI engine parses archives but only reads text (`vaultpay_m3_ai_engine/app/services/file_extractor.py`).

## 7. AI engine (FastAPI)

- Everything the README claims is present as code: `projects.py` (brief → criteria via Claude, mutual approval), `files.py` (upload/extract), `verification.py` (run + report), `paypal.py` (order/approve/webhook/order read), services for criteria parsing, verdict generation, deterministic AST/web checks, Elasticsearch indexing with DB fallback, and safe extraction.
- Protection: every path except `/health` requires `x-internal-key`, compared with `hmac.compare_digest`; missing key ⇒ 503, wrong key ⇒ 403 (`app/core/security.py:22-41`). `/docs` and `/redoc` are behind the same guard.
- CORS is configured from `ALLOWED_ORIGINS` but no browser is meant to call it (`app/main.py:38-44`).
- **It is not deployed.** `vaultlance-ai-engine` does not exist on Fly and its hostname does not resolve (`03-live.md` §2). The Express app calls it only from `GET /api/ai/health` (`ai/ai.routes.ts:18`); the audit checks and chat in the product are implemented locally in Express (`vault.actions.ts:587-812`) and do not use Claude.
- Local Python tests exist (`tests/test_file_extractor.py`, `tests/test_deterministic_checks.py`) plus a `test_ai_verification.py` runner; **not run** here (needs pip install and API keys) — UNVERIFIED.

## 8. Cross-cutting security

| Item | State | Evidence |
|---|---|---|
| Security headers (API) | helmet defaults: CSP, HSTS, nosniff, frame options, referrer policy | live response, `03-live.md` §3 |
| CORS | strict allowlist; foreign origin gets no CORS headers and a 401 on preflight | `app.ts:32-49`; live check |
| Body limits | 10 MB JSON/urlencoded, 2 MB webhook | `app.ts:55-58` |
| Error handler | typed errors pass through; unknown 500 hides the stack outside `development` | `middleware/errorHandler.ts:30-40` |
| Logging | morgan in non-test; logger redacts nothing explicitly but never logs tokens or bodies | `app.ts:51-53`, `shared/logger.ts` |
| Rate limits | auth only | `auth.routes.ts:17` |
| Dependencies audit | **not run** (`npm audit` needs network and would report the whole tree); UNVERIFIED | — |
| Duplicate middleware folders | `middleware/` and `middlewares/` both exist, one unused | `backend/src/middlewares/*` |
| Dead dependency | `@prisma/client` / `prisma` unused | `grep PrismaClient` |
| Legacy route | `POST /:id/authorize` requires a matching on-file authorization (`c5aa254`), so it cannot mint a hold, but it is still mounted | `vault.actions.ts:206` |

## 9. Tests

`backend/tests/`: `auth`, `authorization`, `vault`, `upload-security`, `manifest`, `money-loop`, `money-webhook`, `paypal-m2`, `resilience`, `audit-rerun`, `frontend-url`, `role-source` — 12 files, **50 tests, all passing** (`npx vitest run` in `backend/`, 45.35 s).

Coverage of the money-loop cases you asked about:

| Case | Covered? | Evidence |
|---|---|---|
| Replayed webhook | yes | `money-webhook.test.ts` dedupe assertions |
| Wrong user | yes | `authorization.test.ts`, `money-loop.test.ts` |
| Wrong state | yes | `money-loop.test.ts` ("refuses capture outside AWAITING_APPROVAL") |
| Wrong amount | yes | `paypal-m2.test.ts` amount mismatch |
| Concurrent confirm | partial | compare-and-set is tested; a true parallel race is simulated, not threaded |
| Restart during CAPTURE_PENDING | yes (sweeper) | `resilience.test.ts`, `money/sweeper.ts` |

Not covered: live PayPal sandbox calls (all mocked), Supabase failure modes (silent update errors), and the AI engine.
