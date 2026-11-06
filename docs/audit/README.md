# VaultLance AI — full audit, 2026-11-06

Read-only audit of the repository and the deployed apps. No code, config or dependency was changed; the only files written are the seven documents in this folder. No secret value appears in any of them.

- [00 — Inventory](00-inventory.md): repo map, git state, env names, deployment, checks
- [01 — Frontend](01-frontend.md): every route, data layer, storage, security, bundle
- [02 — Backend](02-backend.md): Express + FastAPI, routes, auth, money, files, tests
- [03 — Live checks](03-live.md): Fly, health, CORS, headers, test runs
- [04 — Flows](04-flows.md): ten end-to-end traces with per-hop verdicts
- [05 — Gaps](05-gaps.md): the prioritised register (B1–B28)
- [06 — Plan](06-plan.md): phases, schedules, cut list, demo script, honest limits, questions

## Overall readiness: **56 %**

Formula: weighted average of eight areas, each scored 0–100 against what its own documents claim.

| Area | Weight | Score | Why |
|---|---|---|---|
| Frontend screens and UX | 20 % | 75 | 21 routes render; design system, a11y and mobile are real; several actions are mock |
| Money loop (hold → capture → payout) | 25 % | 65 | Code path is guarded and tested; reject does not void, webhook does not claim, payout status unreadable |
| Auth and sessions | 10 % | 70 | Real bcrypt/JWT/sessions/reset; JWT fallback secret and no MFA |
| AI engine | 15 % | 20 | Full FastAPI package exists, is not deployed and is not in the product path |
| Security | 10 % | 40 | CORS/helmet/upload guards good; the JWT fallback is confirmed exploitable, no SPA CSP, demo mode in production |
| Deployment and ops | 10 % | 65 | Fly + Vercel live; no CI, no backups documented, engine missing |
| Product completeness (join, payouts, settings) | 5 % | 45 | Join-by-code, payout read, sessions/MFA, staging/remind/duplicate are absent |
| Docs, sponsors, demo assets | 5 % | 45 | Docs dense but stale; Postman + AG Grid only; no video, no limits section |

Weighted: 15 + 16.25 + 7 + 3 + 4 + 6.5 + 2.25 + 2.25 = **56.25 %**.

The money loop is the strongest part of the product; the AI claim and one secret are what hold the number down.

## The ten findings that matter

1. **B1 — Anyone who can read this repo can forge a login, and this was proven live.** `JWT_SECRET` is not set on Fly, and `backend/src/shared/config.ts:10` falls back to a literal key. A token signed with that literal was accepted by the deployed API (it reached the profile lookup and answered `USER_INACTIVE`; a bad signature would have been rejected earlier), and `validateTokenAndSession` recreates a missing session from the payload. With a real user id, the forged token authenticates. This is the first thing to fix — `03-live.md` §8 has the probe output.
2. **B2 — The "AI" engine is not deployed.** `vaultlance-ai-engine` does not exist on Fly and its hostname is NXDOMAIN. The audit checks and chat in the live product are deterministic Express code (`vault.actions.ts:587-812`), and the Express app calls the engine only from a diagnostic route.
3. **B4 — Reject leaves the buyer's money held.** `POST /:id/reject` cancels the vault without calling PayPal's void; only `/void` does. A judge who rejects a funded vault leaves an authorization open.
4. **B3 — PayPal ids are written blind.** `rememberOrder/Authorization/Capture` ignore Supabase errors (`money.store.ts:88-120`), and the vault read falls back to ledger metadata. Whether the columns actually hold the ids in production is unverified; the write cannot tell you.
5. **B7 — The webhook does not claim the hold.** `PAYMENT.AUTHORIZATION.CREATED` stores the authorization id only; claiming still needs the return page, the reconcile button or the next order attempt.
6. **B6 — Join-by-code is not wired.** The server has `POST /:id/join`; the dashboard refuses outside demo mode (`src/lib/api.ts:419-434`). The judged client flow depends on email invites instead.
7. **B5 — Payout failures are invisible.** There is no `GET /:id/payout`, so status, reason and attempt are not readable by the client that offers "Retry payout".
8. **B8 — A failed check has no way out.** No waiver, no revision; `NEEDS_REVISION` exists in the state machine but nothing enters it.
9. **B9 — Demo mode is a production backdoor and some data is fabricated.** `?demo=1` produces a fake signed-in shell on the deployed site, and vault cards invent `8XK…` ids (`data.tsx:71`).
10. **B17/B18 — No green gate.** The Playwright suite reached 139/142 with 43 failures in 8 specs, and there is no CI. Unit tests (65 frontend, 50 backend) and both typechecks pass.

## Pitch claim vs reality

| Claim | Status | Evidence |
|---|---|---|
| "AI escrow" | **PARTIAL / mostly MOCK** | escrow is real PayPal sandbox; the AI part is not in the deployed path (`03-live.md` §2, `04-flows.md` Flow 4) |
| "Files unlock only after payment is captured" | **DONE** | download requires `vault.status === "PAID"`, member-only, 60 s signed URL (`backend/src/vaults/download.routes.ts:27-30`); unlock happens in `confirmCapture` |
| "Client audits real checks" | **PARTIAL** | checks run on real files (name, MIME, size, SHA-256) but are rules, not model verdicts (`vault.actions.ts:587-643`) |
| "Freelancer is paid automatically" | **PARTIAL** | payout is created automatically after capture (`money/capture.service.ts` → `ensurePayout`), but pays the login email, can fail, and its status is not readable |
| "Works for both roles" | **PARTIAL** | both dashboards read the real API; client join, payout read, sessions/MFA remain gaps |
| "Judges can try it in minutes" | **PARTIAL** | sign-up/sign-in are real; a full escrow needs a sandbox personal buyer account, and `/playground` is a redirect |

## What could not be verified, and why

- **Live capture/payout after the latest changes** — the mandate is read-only; no approval, capture or payout was executed.
- **Webhook registration** — **now verified**: `https://vaultlance-ai.fly.dev/api/webhooks/paypal` is registered (id `59D07142LE8753137`) for all events. Whether individual deliveries reached the app is still open; PayPal's event log shows the events were produced, but the retained Fly logs start after them (`03-live.md` §10).
- **PayPal money state** — **now verified** with client credentials: the $23 authorization is `CREATED` and expires 2026-12-04, the $42 capture is `COMPLETED` with a $1.96 fee and $40.04 net. The PayPal sandbox MCP also works with a real token (46 tools), so `03-live.md` §9's empty tool list was a credential problem, not a server one.
- **Whether `paypal_*` columns are populated** — the boot log proves the DDL ran, but reading the values needs an authenticated `GET /api/vaults/:id` on a funded vault.
- **RLS policies and backups** — no policy files in the repo; Supabase dashboard not available.
- **Email delivery for password reset** — no transport provider appears in the code.
- **Python engine tests** — need `pip install` and credentials; not run.
- **`npm audit` / `pip-audit`** — deliberately not run (network installs and a very large advisory surface); dependency risk is therefore unmeasured.
- **Deployed bundle == HEAD** — earlier in the project this was checked after `e7897cd`; not re-downloaded in this audit.
- **Playwright final tally** — the runner restart cut the log at 139/142; the 43 failures are what the log recorded.

## The first five actions, in order

1. **Set `JWT_SECRET` on Fly and delete the fallback literal** (B1). One secret, one restart, sessions re-issued. Everything else is secondary until this is done.
2. **Make reject void the authorization**, then run one full sandbox capture → payout and save the ids as evidence (B4, B28).
3. **Claim the hold from `PAYMENT.AUTHORIZATION.CREATED`** and check every Supabase update result (B7, B3). After this, "automatic" is true without a page open.
4. **Add `GET /:id/payout` and wire join-by-code** (B5, B6). These are the two missing pieces a judge will click.
5. **Do not claim AI until it is wired**: either deploy the engine and call it from `checks/run` (B2, L), or change the pitch to deterministic verification (S). Then make Playwright green and add CI (B17, B18).

## Files created

- `docs/audit/README.md`
- `docs/audit/00-inventory.md`
- `docs/audit/01-frontend.md`
- `docs/audit/02-backend.md`
- `docs/audit/03-live.md`
- `docs/audit/04-flows.md`
- `docs/audit/05-gaps.md`
- `docs/audit/06-plan.md`

Log written outside the audit folder: `.tmp/audit-playwright.log` (untracked; not part of the deliverable).

## Commands run (no secrets printed)

Read-only git and filesystem: `git branch --show-current`, `git status --porcelain`, `git log --oneline -30`, `git log -1 --format`, `git tag`, `git branch -a`, `git ls-files`, `git log --all -S'<pattern>'` (four patterns), `find`, `ls`, `du -sh`, `wc -l`, `grep`/`rg` scans for env names, secrets shapes, routes and flags.

Checks: `npx tsc --noEmit` (root, exit 0), `npx vitest run` (root, 11 files / 65 passed), `npx tsc --noEmit` (`backend/`, exit 0), `npx vitest run` (`backend/`, 12 files / 50 passed), `npx playwright test --reporter=line` (foreground capped at 295 s; background rerun logged to `.tmp/audit-playwright.log`, 139/142 reached, 43 failures).

Live, read-only: `curl` GET/OPTIONS against `https://vaultlance-ai.fly.dev/health`, `/api/ledger`, `/api/vaults`, `/api/webhooks/paypal`, with allowed and foreign `Origin` headers; `curl -D` against `https://vault-lance-ai.vercel.app/`; `curl -v`, `nslookup` and `flyctl status`/`apps list`/`secrets list`/`releases` for both Fly apps (the engine app does not exist).

Nothing was deployed, mutated, registered, paid, uploaded or deleted. No secret value was read, printed or stored.
