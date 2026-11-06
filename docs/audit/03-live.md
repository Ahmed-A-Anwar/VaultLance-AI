# 03 — Live read-only checks

All commands are GET/OPTIONS only, no accounts created, no payment, upload or delete executed.
Times are from 2026-11-06 ~07:24–07:40 UTC, run from this machine (Europe/Paris).

## 1. Fly (read-only)

`flyctl apps list`:

```
NAME          │ OWNER    │ STATUS   │ LATEST DEPLOY
vaultlance-ai │ personal │ deployed │ 13h32m ago
```

Only one app exists. `flyctl secrets list -a vaultlance-ai` (names only):

```
ELASTICSEARCH_API_KEY, ELASTICSEARCH_URL, PAYPAL_BASE_URL, PAYPAL_CLIENT_ID,
PAYPAL_CLIENT_SECRET, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, DIRECT_URL, POSTMAN_API_KEY,
PAYPAL_WEBHOOK_ID
```

Observations:

- **`JWT_SECRET` was absent** at the time of this snapshot. The API therefore signed tokens with the literal fallback committed at `backend/src/shared/config.ts:10`. This is blocking finding **B1**. It was set on 6 November before the batch-1 deploy — see §12.
- `ELASTICSEARCH_API_KEY` / `ELASTICSEARCH_URL` are set on the Express app, which never imports Elasticsearch; the engine that does need them is not deployed.
- `PAYPAL_WEBHOOK_ID` is set, so the webhook can verify signatures. Whether that id is registered for the sandbox app in the PayPal dashboard is a **manual check** (see `06-plan.md`).
- `DIRECT_URL`, `POSTMAN_API_KEY` are leftovers unrelated to the running code paths.

`flyctl status -a vaultlance-ai`:

```
Machine 801e97f61edd48  version 43  region cdg  state started
Checks: 1 total, 1 passing
Image: vaultlance-ai:deployment-307a0489b355cdc3544f58d7909a6453
```

`fly.toml` says `primary_region = "fra"`; the machine actually runs in `cdg` (Paris). `min_machines_running = 1` but the machine had `LAST UPDATED 2026-11-06T07:24:16Z`, i.e. it started as the health request arrived — see the 7.6 s first byte in §3.

## 2. AI engine

```
flyctl status -a vaultlance-ai-engine
→ Error: Could not find App "vaultlance-ai-engine"

nslookup vaultlance-ai-engine.fly.dev
→ *** dns.google can't find vaultlance-ai-engine.fly.dev: Non-existent domain

curl -s https://vaultlance-ai-engine.fly.dev/health
→ Could not resolve host
```

**Verdict: the AI service is MISSING from production.** `AI_SERVICE_URL` in `backend/fly.toml` points at `http://vaultlance-ai-engine.internal:8000`, which cannot resolve. Consequently:

- `GET /api/ai/health` (authenticated) would return an upstream failure. Not called here (needs a token).
- The product's audit checks and chat never reach this service anyway: the only `callAiService` caller is that diagnostic route (`backend/src/ai/ai.routes.ts:18`). The live audit is generated in Express from file metadata (`vault.actions.ts:587-643`) and chat answers are templates (`:648-812`).

## 3. API health and edges

| Check | Result |
|---|---|
| `GET https://vaultlance-ai.fly.dev/health` | `200`, body `{"status":"healthy","version":"phase1-money-loop","service":"VaultPay / VaultLance API","databaseHealthy":true,...}` |
| TTFB / total for that request | **7.593 s / 7.594 s** (machine cold-started at that second) |
| `GET /api/ledger` without a token | `401` `{"code":"MISSING_TOKEN"}` — scoped read is not reachable anonymously |
| `GET /api/vaults` without a token | `401` |
| `OPTIONS /api/vaults`, `Origin: https://vault-lance-ai.vercel.app` | `204`, `access-control-allow-origin: https://vault-lance-ai.vercel.app` |
| `OPTIONS /api/vaults`, `Origin: https://evil.example` | `401`, **no** `access-control-allow-origin` header (blocked) |
| `GET /api/webhooks/paypal` | `404` (POST-only route; correct) |
| Helmet headers on `/health` | CSP (`default-src 'self'; …`), HSTS 31536000 includeSubDomains, `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy: no-referrer`, COOP/CORP same-origin |

`/health` reports `databaseHealthy: true`, so Supabase is reachable from the machine.

## 4. Frontend

| Check | Result |
|---|---|
| `GET https://vault-lance-ai.vercel.app/` | `200`, SPA HTML |
| Headers | `Strict-Transport-Security` (Vercel), `X-Vercel-Cache`, `X-Vercel-Id` — **no CSP, no nosniff, no frame options, no referrer policy** |
| SPA fallback | `vercel.json` rewrite `/(.*) → /index.html` is present; not exercised here (a deep link check needs a browser) |
| Clip caching | `vercel.json` sets `immutable` 1-year cache for `/wheel-turn/(.*)` and `/keypad-frames/(.*)`; `vault-frames` has no cache rule |

The deployed bundle was not re-downloaded in this audit. Earlier verification in this project matched the deployed chunk to the local build after `e7897cd`; treat "deployed bundle == HEAD" as UNVERIFIED for this report.

## 5. CORS and origin behaviour (summary)

- Browser calls from `https://vault-lance-ai.vercel.app` are allowed and `credentials: true` is set in `cors()`, although the API uses bearer tokens and no cookies — harmless but wider than needed.
- Foreign origins receive no CORS headers, so the browser blocks; a preflight also gets `401` from the route-level `requireAuth`, which is fine.
- `FRONTEND_ORIGINS` in `backend/fly.toml` includes `http://localhost:5173`; that only matters for local dev.

## 6. Test runs

| Suite | Command | Result |
|---|---|---|
| Frontend unit | `npx vitest run` | 11 files, **65 passed**, 2.43 s |
| Backend unit | `cd backend && npx vitest run` | 12 files, **50 passed**, 45.35 s |
| Frontend typecheck | `npx tsc --noEmit` | exit 0 |
| Backend typecheck | `cd backend && npx tsc --noEmit` | exit 0 |
| E2E | `npx playwright test --reporter=line` | See §6.1 |

### 6.1 Playwright — the suite is red

The foreground attempt hit the 295-second tool cap at 74/142; a background rerun (`.tmp/audit-playwright.log`) reached **139/142** before the runner was restarted, and the log's last line is an assertion failure, not a summary. At that point the log recorded **43 failing tests across 8 spec files**:

| Spec | Failures |
|---|---|
| `tests/settings.spec.ts` | 13 |
| `tests/auth-reset.spec.ts` | 8 |
| `tests/freelancer-settings.spec.ts` | 8 |
| `tests/cta-overlay.spec.ts` | 4 |
| `tests/auth-shots.spec.ts` | 3 |
| `tests/reduced-motion.spec.ts` | 3 |
| `tests/settings-shots.spec.ts` | 3 |
| `tests/responsive.spec.ts` | 1 |

Representative errors: `#reset-password` not fillable (`auth-reset.spec.ts:36`); `.fd-banner` not visible (`freelancer-settings.spec.ts:55`); `getByTestId('account-summary')` never appears (`settings.spec.ts:27`).

The likely cause is structural, not cosmetic: the suite was written against the mock-data build, and `FX_REAL_DEFAULTS` now switches every group to the real API (`src/config/fx.ts:73-84`). With no Express server behind the Playwright dev server (`playwright.config.ts` starts only Vite), pages that now wait on `GET /api/...` render an error state instead of the mock fixtures the assertions expect. That explanation fits every failing spec (settings, reset, freelancer banner, CTA) and is **probable but not proven** — confirming it needs one spec run with the API up.

**Reported honestly:** the E2E suite is not a green gate today; it has not been green since the real-API defaults shipped. Unit tests (65 + 50) and both typechecks are green.

## 7. Manual checks (not possible from here)

1. PayPal sandbox webhook registration: developer.paypal.com → Apps & Credentials → sandbox app → Webhooks → confirm the URL `https://vaultlance-ai.fly.dev/api/webhooks/paypal` and the event types listed in `backend/src/paypal/webhook.service.ts:47-128`. Expected: `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.PAYOUTS-ITEM.*`.
2. Whether `PAYPAL_WEBHOOK_ID` in Fly matches that webhook (values are secret; compare in the dashboard only).
3. A real buyer approval with a sandbox personal account, then a `GET /api/vaults/:id` with a client token to see whether `paypalAuthorizationId` comes from the vault row or the ledger fallback (gap B3).
4. Rotate/set `JWT_SECRET` (`flyctl secrets set JWT_SECRET=…`), then re-login all sessions.
5. Vercel environment: confirm `VITE_API_URL=https://vaultlance-ai.fly.dev/api` and `VITE_PAYPAL_CLIENT_ID` are set for the production build (Project → Settings → Environment Variables).

## 8. Fly logs and tooling availability (added after the owner enabled Fly/PayPal access)

Fly was already authenticated for `ahmedidea12@gmail.com`, so read-only CLI calls were used. `flyctl releases` shows `v43` (current), `v42`, `v41`, `v40`, `v39` all complete, the newest 14h9m old.

Filtered `flyctl logs -a vaultlance-ai --no-tail` (machine start at 07:24Z):

```
07:24:16Z health  [error] Health check 'servicecheck-00-http-8080' has failed …
07:24:21Z app     [WARN] [paypal] PAYPAL_BASE_URL is set and ignored; using https://api-m.sandbox.paypal.com
07:24:21Z app     [INFO] [paypal] sandbox mode confirmed
07:24:21Z app     [INFO] [schema] money-loop schema is up to date
07:24:23Z app     [ERROR] UnauthorizedError: Authentication token is required.   (this audit's unauthenticated probes)
07:24:29Z app     GET /api/webhooks/paypal 404 0.792 ms - 80   (this audit's GET probe)
```

What this settles:

- **The money-loop DDL ran on the deployed machine.** The `ALTER TABLE vaults ADD COLUMN IF NOT EXISTS paypal_order_id / paypal_authorization_id / paypal_capture_id` statements in `money/schema.ts` executed successfully at boot. The columns exist; whether they hold values is still open (gap B3).
- **The machine cold-started on the first request** — the health check failed at 07:24:16 and passed by 07:24:21, matching the 7.6 s first byte. `min_machines_running = 1` did not keep it warm.
- **No PayPal webhook appears in the retained logs** — but that is a window artefact, not a fact about the app: these logs start at 07:24Z on 6 November and every event is from 5 November. Delivery and storage are now proven directly from the PayPal dashboard and the database (§11), and the registration is confirmed (§10).
- `PAYPAL_BASE_URL` is set in Fly (and in `render.yaml`) but ignored by design; that warning is expected.

### Tooling note

Fly and PayPal MCP servers do not appear in this chat's tool list: `search_mcp_tools` with `server: "fly"`, `"flyio"`, `"paypal"` and `"paypal-sandbox"` all returned no tools, and generic queries returned only Playwright/filesystem/Figma servers. No MCP config exists in the workspace (`ls -a | grep -i mcp` → none).

`backend/.env` contains a local `JWT_SECRET` but **not** `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` or `PAYPAL_WEBHOOK_ID`, so a direct read-only PayPal REST check (webhook list, authorization/order/capture status) could not be run from here. To enable it, either connect the PayPal MCP so its tools reach the chat, or put the two sandbox credentials in `backend/.env` locally (never in chat); the reads are three GETs and print only status and amount.

Path routing matters: `POST /http` (the documented streamable-HTTP path) returns **404**, while `POST /sse` and `POST /mcp` return 401 with the OAuth challenge. A connector pointed at `/http` or at the bare host would therefore show an empty tool list even with a valid token; `https://mcp.sandbox.paypal.com/sse` is the path that exists on the sandbox deployment.

The PayPal endpoint itself is healthy — it just wants a token. `GET https://mcp.sandbox.paypal.com/mcp` and a JSON-RPC `initialize` both return **401** with `WWW-Authenticate: Bearer realm="OAuth", error="invalid_token", error_description="Missing or invalid access token"`, and `/.well-known/oauth-protected-resource` answers 200 with `authorization_servers: ["https://mcp.sandbox.paypal.com"]`. An empty tool list is therefore an authorisation state, not a broken server: the connector needs an OAuth grant before it can enumerate or call its tools.

The Fly **integration** (not MCP) is available and was used to corroborate the CLI: `FLY_GET_APP_DETAILS` returns `vaultlance-ai`, `FLY_LIST_MACHINES` returns exactly one machine (`801e97f61edd48`, region `cdg`, state `started`), and `FLY_LIST_APPS` for org `personal` lists only that app. The PayPal Sandbox entry in the app's Integrations screen (`mcp.sandbox.paypal.com`) sits above the "Connected" heading in the owner's screenshot, and `search_mcp_tools` for it returns nothing — so it is configured app-side but not present in this session's registry: the owner reports supplying a bearer token, yet `call_mcp_tool` for server `"PayPal Sandbox"` still answers `No MCP server named "PayPal Sandbox" is configured`, and no token file exists in the workspace (`.freebuff` holds only `project-id`). MCP servers appear to be bound when a chat starts, so the tools will only be callable from a chat opened after the connector was authorised. Alternatively the endpoint can be driven directly over HTTP with that token (read-only `initialize` → `tools/list` → `tools/call`), which needs the token in a local file, never in the transcript.

## 9. PayPal sandbox MCP — reached, but the token is not a PayPal token

With `BEARER_TOKEN` from the local `backend/.env` (80 characters, value never printed):

```
GET  https://mcp.sandbox.paypal.com/sse  -> 200  text/event-stream
  event: endpoint   data: /sse/message?sessionId=<redacted>
POST initialize  -> ok   serverInfo {"name":"PayPal MCP Agent","version":"1.0.0"}
POST tools/list  -> 46 tools
```

So the transport question is settled: the sandbox MCP speaks **SSE** at `/sse`, and a JSON-RPC session over that stream works. `/http` and `/mcp` are 404 on this deployment, and unauthenticated requests to any path get the OAuth challenge — the 401 is a gate, not a path check.

The 46 tools are invoicing (24), products/subscriptions (11), shipments (3), orders (`create_order`, `get_order`, `pay_order`), disputes (3), transactions (`list_transactions`, `create_refund`, `get_refund`) and `get_merchant_insights`. **There is no webhook tool**, so the registered-URL check cannot be done through MCP at all.

Every tool call then fails at the PayPal layer:

```
get_order 23623123CT6234507        -> {"ok":false,"status":401,"code":"PAYPAL_API_HTTP_ERROR","message":"Token signature verification failed"}
list_invoices                      -> same
list_transactions (12-month range) -> same
```

And the token itself, straight against REST:

```
GET https://api-m.sandbox.paypal.com/v1/notifications/webhooks -> 401 invalid_token, Token signature verification failed
GET https://api-m.paypal.com/v1/notifications/webhooks         -> 401 invalid_token, Token signature verification failed
GET https://api-m.sandbox.paypal.com/v2/checkout/orders/...    -> 401 invalid_token, Token signature verification failed
```

Shape check of the stored value (no value shown): length 80, single segment (not a JWT), base64url-safe, begins with `A`, does not begin with `A21`. A sandbox access token begins `A21AA…` and runs to roughly 1 500 characters with a 32 400 s lifetime; 80 characters is the length of a **client ID**, not an access token. The MCP gateway accepts any bearer for the handshake, so the failure only surfaces on the first tool call.

Consequence at the time: the transport and tool catalogue were verified but no PayPal data had been read. That changed once the sandbox client ID and secret were placed in `backend/.env` — see §10.

## 10. PayPal sandbox verified with client credentials

A client-credentials token was minted from the sandbox app (`POST /v1/oauth2/token` → 200, `expires_in` 32 125) and used for four read-only calls. No value was printed.

### Webhook registration — registered, all events

```
GET /v1/notifications/webhooks -> 200
  id 59D07142LE8753137
  url https://vaultlance-ai.fly.dev/api/webhooks/paypal
  event_types: *   (one wildcard subscription)
```

So the endpoint is registered and subscribed to **every** event, which is why the app's own filter matters: unknown types are stored and ignored.

### The $23 order and its hold — uncaptured, expires 4 December

```
GET /v2/checkout/orders/23623123CT6234507 -> 200
  23623123CT6234507  COMPLETED  23.00 USD
  authorization 8WL58666GM8569742  CREATED  23.00

GET /v2/payments/authorizations/8WL58666GM8569742 -> 200
  CREATED | 23.00 USD | created 2026-11-05T17:02:23Z | expires 2026-12-04T17:02:23Z
```

The hold is real, uncaptured and **valid for another four weeks**. This is the concrete cost behind B4: a reject that cancelled the vault without voiding would leave $23 of the client's money held until 4 December. The batch-1 fix voids before cancelling.

### The $42 capture — completed, with the real fee

```
GET /v2/payments/captures/1N580818UH671613V -> 200
  COMPLETED | 42.00 USD | fee 1.96 | net 40.04 | 2026-11-05T14:57:20Z
```

The effective PayPal fee is 4.67% of gross. The app's payout rule (`net − 5% of gross`) therefore pays less than "gross − PayPal fee"; the two figures can now be reconciled against `vault_captures.paypal_fee_cents` and `payout_cents` instead of assumed.

### PayPal's event log — the events exist

`GET /v1/notifications/webhooks-events?page_size=20` returned 20 events from 2026-11-05, including `CHECKOUT.ORDER.APPROVED` (17:01:32Z) and `PAYMENT.AUTHORIZATION.CREATED` for `8WL58666GM8569742` (17:02:27Z), `PAYMENT.CAPTURE.COMPLETED` for `1N580818UH671613V` (14:57:25Z) and `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` (14:57:46Z). The dashboard shows every one of these deliveries as `Status: Success`, and the matching `paypal_events` rows exist in the database — receipt is proven in §11.

### MCP with a real token

With the same access token the MCP session works end to end: `GET /sse` → 200, `initialize` → `PayPal MCP Agent 1.0.0`, `tools/list` → 46 tools, and `get_order` returned the real order (`COMPLETED`, `23.00`, buyer `freebuffclient@personal.example.com`). The earlier failure was the credential, not the server or the connector.

### JWT fallback probe (read-only, confirms B1)

A token was signed with the HS256 fallback literal read directly from `backend/src/shared/config.ts:10` (the value was never printed), carrying a random, non-existent `userId` and `sessionId`, then sent to `GET https://vaultlance-ai.fly.dev/api/auth/me`:

```
probe /api/auth/me: 401 code= USER_INACTIVE message= User account no longer found.
```

A wrong signature is rejected before any lookup, so `USER_INACTIVE` (a profile miss) means **the forged signature was accepted**. With a real user id from the database, the same token would authenticate as that user. B1 is no longer theoretical: the deployed API signs and accepts the public fallback secret.

## 11. Database reconciliation — what the app actually recorded

Read-only SQL run by the owner in the Supabase editor, 6 November. These are the first figures that come from the app's own tables rather than from inference.

### The $23 vault was authorized — twelve minutes after the webhook

```
vault 966d3c39-d178-4105-b53e-e0fd40fe574f
  status AUTHORIZED | amount 23.00
  paypal_order_id         23623123CT6234507
  paypal_authorization_id 8WL58666GM8569742
  paypal_capture_id       NULL
  updated_at              2026-11-05 17:15:02.2891+00
```

```
paypal_events
  PAYMENT.CAPTURE.COMPLETED       vault 76c4f095-…  received 2026-11-05 14:57:36.758  COMPLETED
  CHECKOUT.ORDER.APPROVED         vault 966d3c39-…  received 2026-11-05 17:01:33.520  COMPLETED
  PAYMENT.AUTHORIZATION.CREATED   vault 966d3c39-…  received 2026-11-05 17:02:46.511  COMPLETED
```

```
ledger_events (966d3c39)
  VAULT_CREATED     23.00  2026-11-05 16:58:15.997
  FUNDS_AUTHORIZED  23.00  2026-11-05 17:15:02.335
```

The webhook event was stored and marked `COMPLETED` at **17:02:46**, but `FUNDS_AUTHORIZED` and the `updated_at` that matches it are at **17:15:02** — a 12 minute 16 second gap. At `batch1-pre` the `PAYMENT.AUTHORIZATION.CREATED` branch only called `rememberAuthorization(vaultId, resource.id)` and returned; it never moved the vault or wrote the ledger. The state change therefore came from the browser return route (`claimApprovedOrder`), which is exactly B7: a buyer who never comes back has a paid-looking PayPal hold and a vault that stays `AWAITING_CAPTURE`.

It also shows why `processing_status = COMPLETED` must not be read as "the money moved": the handler finished normally while doing nothing to the state machine.

### The $42 capture reconciles exactly

```
vault_captures (76c4f095-…)
  capture 1N580818UH671613V | gross 4200 | fee 196 | net 4004 | payout 3794
```

`4004 − 5% × 4200 (210) = 3794`, and `fee 196` equals PayPal's `1.96` from §10. So for this vault the recorded fee is real, not estimated, and the payout follows the documented rule (`net − 5% of gross`). No B3-style id corruption on this path.

### What this settles, and what it does not

- **Settled:** webhook registration, delivery (dashboard `Success`), signature acceptance, dedupe, vault matching, and event persistence all work.
- **Settled:** the webhook did not claim the authorization; the return did, 12 minutes later. B7 is confirmed on live data, and its fix targets the right path.
- **Not settled:** whether the fix works. Every row above predates `142ac27`; proving the new claim needs a deploy and a resent `AUTHORIZATION.CREATED` (see MANUAL CHECKS). Reject/void (B4) likewise still needs the sandbox run.

## 12. Batch 1 deployed and verified live (6 November)

Deployed `1be36f4` to `vaultlance-ai` (machine `801e97f61edd48`, version 46). `JWT_SECRET` was generated locally with `openssl rand -hex 32`, written to a git-ignored file and passed to `fly secrets set` through a command substitution, so the value never appeared in a command line, a log or this report.

```
fly secrets list  ->  JWT_SECRET  Deployed
fly status        ->  version 46, started, 1 check passing
GET /health       ->  200, databaseHealthy true, 0.31 s (warm)
```

### Live probes

| Probe | Result | What it proves |
|---|---|---|
| HS256 token signed with the old fallback literal | `401 INVALID_TOKEN` | B1: the public secret is gone; a forged signature is rejected before any lookup |
| HS256 token signed with the new secret, random user and `sessionId` | `401 SESSION_REVOKED` | B1: a valid signature is not enough — no live session row means no access, and none is recreated |
| `GET /api/vaults` without a token | `401` | anonymous reads still blocked |
| PayPal resend of `WH-8UX87945H9837253U-…` (`AUTHORIZATION.CREATED`, $23) | PayPal `202`; app log `POST /api/webhooks/paypal 200 1985.867 ms` | the deployed route verifies a real PayPal signature and processes the event without erroring |
| PayPal authorization `8WL58666GM8569742` after all of the above | still `CREATED`, $23.00 | nothing was captured or voided by the deploy |

The resend hit a vault already in `AUTHORIZED`, so the claim was idempotent by design and changed no state; it proves transport, signature and routing, not the claim transition.

### Secret-handling note

The first secret was base64. It verified correctly in Node but every token minted from it was rejected by the deployed app, which is consistent with the value being altered between the Windows shell and `flyctl` (base64 contains `+`, `/` and the file carried a trailing CR). It was replaced with a hex value, after which the probes behaved exactly as the code intends. The practical consequence of either change is the same and intended: **every existing session was signed out**.

### Still not verified live

- **B4 (reject → void)** and **B7's claim on an `AWAITING_CAPTURE` vault** need a signed-in client and a fresh PayPal hold. No test credentials are available to this audit, so both remain in MANUAL CHECKS.
- **B9 (frontend demo gate)** is not live: only the API was deployed. The Vercel CLI is not installed here and no frontend deploy was made, so the production bundle still runs the previous build.

## 13. B9 verified against a production build (6 November)

`npm run build` (typecheck + Vite) exited 0. In the emitted bundle `VITE_ENABLE_DEMO` is absent entirely: the flag was undefined at build time, so `demoAllowedInBuild(false, undefined)` folded to `false`. The `vl_demo_mode` storage key survives as a harmless string, but nothing consults it without that gate.

Functional check, served with `vite preview` on the built `dist/`:

1. open `/signin?demo=1`
2. set `localStorage.vl_demo_mode = "true"`
3. sign in with `demo@example.com` / `password123`

Result: `POST /api/auth/login` → `404`, the page stayed on `/signin` showing "Request failed with status 404", and no `vl.dash.session` or token was written. A demo-enabled build would have fabricated a session from the email and navigated into the dashboard. **B9 holds for a production bundle.**

### Deployment blocker

The frontend was **not** deployed. `vercel whoami` answers "Logged out", there is no `VERCEL_*` token in the environment and no `.vercel/project.json` link, so a production deploy needs `npx vercel login` first. Production still serves the previous bundle.

When it is deployed, `VITE_API_URL` must be set to `https://vaultlance-ai.fly.dev/api` in the Vercel project: the built bundle falls back to same-origin `/api`, and `vercel.json` rewrites everything to `index.html`, so without it the sign-in POST lands on HTML. The local 404 above is precisely that failure with no proxy.

### B4 still needs a session

Rejecting a vault is a client-only, authenticated action. No test credentials are available to this audit, so the void-on-reject path has not been exercised against the deployed API. It needs a client login on an `AUTHORIZED` vault (the $23 hold is live until 4 December) and then a check of the authorization in PayPal.

## 14. Frontend shipped and B9 verified in production (6 November)

PR #20 merged as `c5d8755`; Vercel built `main` and now serves `assets/index-Okkns-JY.js` (450 436 bytes). The bundle contains `vl_demo_mode` once and **no** `VITE_ENABLE_DEMO` string, so the gate is compiled shut. The Fly GitHub integration deployed the same commit as release v48.

### Attack against production

1. open `https://vault-lance-ai.vercel.app/?demo=1`
2. set `localStorage.vl_demo_mode = "true"`
3. sign in as `demo@example.com` / `password123`

Observed traffic and result:

```
OPTIONS https://vaultlance-ai.fly.dev/api/auth/login -> 204 (preflight)
POST    https://vaultlance-ai.fly.dev/api/auth/login -> 401
page text: "Wrong email or password."
sessionStorage vl.dash.session: null
api token: null
path: /signin?demo=1
```

So the shipped bundle ignores both visitor-controlled switches, calls the **real** API at the configured origin, and fails closed. A demo-enabled build would have fabricated a session from the address and walked into the dashboard. **B9 is verified live.** This supersedes the deployment blocker recorded in §13.

### API re-check after the automatic deploy

A push to `main` also triggers the Fly deployment, so the two B1 probes were repeated against release v48:

```
GET /health                                  -> 200
old fallback token  -> 401 INVALID_TOKEN
correct HS256 token, unknown sessionId -> 401 SESSION_REVOKED
```

### B4 remains the only unverified item

Rejecting a vault still needs a signed-in client. No credentials for the client account were available, so the void-on-reject path has not been exercised. The $23 authorization `8WL58666GM8569742` is live until 4 December and is the natural subject for that test.
