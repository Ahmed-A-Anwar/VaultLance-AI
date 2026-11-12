# VaultLance AI

Escrow for digital deliverables. A freelancer submits work into a vault, the
client's money is **authorized** at PayPal (held, not captured), the audit runs,
and the client's approval captures it, unlocks the files and pays the freelancer.
A rejection voids the authorization and charges nothing.

Every payment path runs against the **PayPal sandbox**. There are no live
credentials in this build and no real money moves.

## Architecture: one owner for state and money

```
browser (React 19 + Vite)
   │  bearer JWT
   ▼
Express API — backend/          ← the only component that changes vault state or money
   ├── auth/          register, login, JWT + session, password reset, profiles
   ├── vaults/        vault CRUD, invites/join codes, submit, accept/reject/revision
   ├── paypal/        order → authorize → capture/void; webhook (raw body, verified)
   ├── money/         claim / approve / capture services; the only money-row writers
   ├── audit/         deterministic checks + grounded audit
   ├── uploads/       multipart upload, zip-slip/zip-bomb defense, signed downloads
   ├── manifests/     canonical JSON + SHA-256 reproducibility
   └── ledger/        ledger events
        │ INTERNAL_API_KEY
        ▼
FastAPI AI engine — vaultpay_m3_ai_engine/   stateless; its PayPal router is not registered
```

- **Express owns state and money.** Every mutating route is authenticated, checks
  membership, and writes through `money/`. Claim, approve and capture are
  compare-and-sets, so the browser return, the reconcile route and the webhook can
  race and exactly one writes.
- **Express calls the AI.** The audit engine reads vault context and returns
  findings; it cannot create an order, capture, void or pay out. The browser never
  talks to it.
- **PayPal is sandbox.** `PAYPAL_ENV=sandbox` pins every call to
  `api-m.sandbox.paypal.com`; there is no live switch in this codebase.
- **Data.** Supabase Postgres plus a private storage bucket when configured; an
  in-memory store for local runs when it is not.

Details: `docs/architecture.md`, `docs/decisions.md`, `docs/openapi.json` (45
paths, 50 operations, generated from the routes).

## Tests (real counts, measured on this machine)

| suite | command | result |
| --- | --- | --- |
| frontend unit | `npm run test:unit` | **76 passed**, 14 files (vitest) |
| backend | `cd backend && npm test` | **145 passed**, 28 files (vitest, ~130s) |
| browser e2e | `npx playwright test` | 149 tests, **44 fail in 8 specs** — quarantined, see below |

`.github/workflows/ci.yml` runs frontend typecheck + unit + build and backend
typecheck + tests on every PR and on `main`. Playwright is deliberately not in
CI until the quarantined specs are re-pointed.

## Setup

Node 22+.

```bash
npm install
npm run dev                                  # http://localhost:5173

cd backend && npm install && npm run dev     # http://localhost:3000
```

Health: `GET http://localhost:3000/health`. Unit tests need no network.

### Environment: names only

Values never live in this repository; see `docs/deploy-secrets.md` and
`docs/deploy-real-accounts.md`.

- **Frontend** (`.env`, inlined by Vite at build time): `VITE_API_URL`,
  `VITE_PAYPAL_CLIENT_ID`
- **Backend** (`backend/.env`): `NODE_ENV`, `PORT`, `APP_VERSION`,
  `FRONTEND_URL`, `FRONTEND_ORIGINS`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`,
  `USE_IN_MEMORY_DB`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `DATABASE_URL`,
  `DIRECT_URL`, `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
  `PAYPAL_WEBHOOK_ID`, `PAYPAL_BASE_URL`, `AI_SERVICE_URL`, `INTERNAL_API_KEY`,
  `ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY`
- **AI engine** (`vaultpay_m3_ai_engine/.env.example`): `SECRET_KEY`,
  `ALLOWED_ORIGINS`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `azure gpt5 min_MODEL`,
  `PAYPAL_MODE`, `ELASTICSEARCH_URL`, `REDIS_URL`

`JWT_SECRET` must be 32+ characters in production; the API refuses to start
without it. There is no fallback value on purpose.

### Hosting

Vercel serves `dist/` with an SPA rewrite and now sends security headers and a
**report-only** CSP (`vercel.json`): HSTS, `nosniff`, `frame-ancestors 'none'`,
`Permissions-Policy`, COOP, and an allowlist for PayPal's script/frame/connect
origins plus the API. Flip `Content-Security-Policy-Report-Only` to
`Content-Security-Policy` after one deployed smoke of sign-in, a PayPal approve
and a download.

The API runs from `render.yaml` or `backend/fly.toml`; both read the names above.

## PayPal sandbox accounts

Create three at developer.paypal.com → Sandbox → Accounts:

- a **business** account whose client id/secret become `PAYPAL_CLIENT_ID` /
  `PAYPAL_CLIENT_SECRET`
- a **personal** account for the client, who approves the order in the sandbox
  buyer flow
- a **personal** account for the freelancer's payout email (sandbox can only pay
  a sandbox account)

`PAYPAL_WEBHOOK_ID` comes from the sandbox app's webhook subscription; without it
every webhook is rejected, which is intentional.

## How a judge tries it (5 minutes)

1. `/signup` → freelancer; Settings → save the payout email (reads VERIFIED).
2. New vault → upload a delivery → **Submit** → copy the invite code.
3. Second browser profile: `/signup` → client → **Join** with the code.
4. Client opens **Open PayPal**, signs in as the sandbox buyer, approves; the
   vault moves to **AUTHORIZED** (money held, not taken).
5. Run the checks → **Approve** → **PAID**; the download unlocks and the freelancer
   Payments page shows the payout.
6. Reject path: a second vault → **Reject** → the hold is voided, files stay locked.

`docs/evidence/results.json` records 7/7 steps PASS on 2026-11-06 against the
deployed pair (Vercel + Fly), including webhook replay, wrong user, wrong state,
pre-PAID 403, amount mismatch and a restart during `CAPTURE_PENDING`.
Screenshots: `docs/evidence/screenshots/`.

## Honest limits

- **Sandbox only.** No real money, no live PayPal, sandbox payouts. The split
  (hold → capture → fee → payout) is real logic, not real money.
- **The evidence run's freelancer password was rejected** (the stored value was
  3 characters), so that run registered a disposable freelancer. The recorded
  account is not reproducible as-is.
- **In-memory fallback** without Supabase: accounts, vaults and sessions vanish on
  restart.
- **Uploads** go to the instance disk unless Supabase Storage is configured;
  Render does not keep that disk across deploys.
- **AI audit needs the engine.** Deterministic checks and the whole money loop
  work without it; chat and the grounded audit return a typed error.
- **The newest client PayPal path** (direct checkout fallback when the SDK button
  does not render) is covered by unit + browser tests locally; the live sandbox
  approval in `docs/evidence` went through the SDK button.
- **CSP is report-only**, and no report endpoint is configured, so violations
  appear only in the browser console.

### e2e quarantine

These specs still assert the pre-API mock seed (a fabricated `sessionStorage`
session, demo vaults, removed testids). They fail on `main` against the real
store and are excluded via `testIgnore` in `playwright.config.ts` — not deleted.
44 of 149 tests.

| spec | failing | cause |
| --- | --- | --- |
| `settings.spec.ts` | 13 | settings requires a real session; old mock seed |
| `auth-reset.spec.ts` | 8 | forgot/reset screens changed (testids, copy, bolt states) |
| `freelancer-settings.spec.ts` | 8 | same, plus hash-landing testids |
| `cta-overlay.spec.ts` | 4 | payoff CTA markup and named paths changed |
| `auth-shots.spec.ts` | 4 | screenshot spec over the same reset screens |
| `reduced-motion.spec.ts` | 3 | landing caption scenes changed |
| `settings-shots.spec.ts` | 3 | waits on `account-summary` on a signed-out page |
| `responsive.spec.ts` | 1 | 320px CTA assertion against the old hero |

Fixing one means pointing it at `VITE_API_URL` and a seeded test account, not
changing the app.

## Repository layout

```
src/                        React SPA
backend/                    Express API (tests in backend/tests)
vaultpay_m3_ai_engine/      internal FastAPI audit engine
tests/                      Playwright specs (quarantine list above)
postman/                    generated collection + value-free environment
docs/                       architecture, deploy guides, evidence, openapi.json
docs/archive/steps/         the step-04…11 delivery notes, archived
scripts/gen-api-docs.mjs    regenerates docs/openapi.json + the Postman collection
```

`npm run gen:docs` rebuilds both API artifacts from one route table. The Postman
environment export carries variable names only — paste your own sandbox values.
