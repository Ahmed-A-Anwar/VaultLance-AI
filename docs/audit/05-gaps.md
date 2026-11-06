# 05 — Gap register

Sorted by priority. Severity: **BLOCKER** = the demo cannot move money or a judge cannot get in; **HIGH** = security/data-loss or a core pitch claim is fake; **MEDIUM** = visible bug, dead link or missing secondary feature; **LOW** = polish.
Effort: S < 2 h, M ≈ half a day, L ≥ a day. Owner: FE (frontend), EX (Express), AI (FastAPI), INFRA, ME (manual).

| ID | Area | Finding | Severity | Effort | Demo impact | Evidence | Suggested fix | Owner |
|---|---|---|---|---|---|---|---|---|
| B1 | Auth | `JWT_SECRET` is absent from Fly secrets, so tokens are signed with the repo's literal fallback; **confirmed live**: a token signed with that literal was accepted by the deployed API (it reached the profile lookup and answered `USER_INACTIVE`, not invalid-token), and `validateTokenAndSession` recreates a missing session from the payload | BLOCKER | S | Full account takeover with any known user id | `backend/src/shared/config.ts:10`; `auth.service.ts:validateTokenAndSession`; `flyctl secrets list`; probe in `03-live.md` §8 | Set `JWT_SECRET` (32+ random bytes) on Fly, restart, invalidate sessions; remove the fallback literal and throw at boot instead | INFRA + EX |
| B2 | AI | The FastAPI engine is not deployed; the API never calls it; checks and chat are local metadata templates | BLOCKER (pitch) | L (deploy+wire) / S (reframe) | "AI escrow" cannot be shown as AI | `03-live.md` §2; `backend/src/ai/ai.routes.ts:18`; `vault.actions.ts:587-812` | Either deploy `vaultlance-ai-engine` with `ANTHROPIC_API_KEY` + `INTERNAL_API_KEY`, call it from checks/chat, or relabel the feature honestly | AI + EX |
| B3 | Money | PayPal id writes ignore Supabase errors (`rememberOrder/Authorization/Capture`); reads depend on a ledger fallback. The boot log confirms the DDL ran (`[schema] money-loop schema is up to date`), so the columns exist — whether they hold values is unverified | HIGH | S | Receipt can show a ledger-derived id while the row is empty | `money/money.store.ts:88-120`; `vaults/vault.domain-service.ts`; `03-live.md` §8 | Check and log every update error, backfill the three columns from `ledger_events` metadata, then read the row first | EX |
| B4 | Money | Reject cancels the vault but never voids the PayPal authorization; the buyer's hold stays active | HIGH | S | "Reject" demo leaves money held | `vault.actions.ts:305-343` vs `paypal.routes.ts:474-545` | Call the same void helper from reject, and record `VAULT_CANCELLED` with the authorization id | EX |
| B5 | Money | No `GET /:id/payout`; payout status, reason, attempt and item id are not readable by the UI | HIGH | S | "Automatically paid" cannot be shown when a payout fails | `money/payout.routes.ts` (retry only); `docs/phase2-map.md:183` | Add the read route (member-scoped) and surface it on the payments card | EX + FE |
| B6 | Join | Join-by-code is not wired: UI refuses outside demo; server has `POST /:id/join` but needs the vault id, and there is no code→vault lookup | HIGH | M | A judge with a code cannot join | `src/lib/api.ts:419-434`; `vaults/invite.routes.ts:33` | Add `POST /api/vaults/join { code }` (generic 404), then call it from `JoinRow` | EX + FE |
| B7 | Webhook | `PAYMENT.AUTHORIZATION.CREATED` stores the id only; the hold is not claimed, so a buyer who closes the tab still needs a page load/click | HIGH | S | "Automatic" escrow depends on the return page | `paypal/webhook.service.ts:53-61` | Call `claimApprovedOrder`-equivalent in the webhook, with the amount check, then verify one live event | EX |
| B8 | Audit | No waiver and no revision path; `NEEDS_REVISION` is unreachable; the UI's `overrideFailures` is ignored by the server | HIGH | M | A failed check leaves only capture-or-cancel | `vault.state-machine.ts:13`; `src/lib/api.ts:399`; `money/approve.service.ts` | Add `POST /:id/revision` (→ `NEEDS_REVISION`) and `POST /:id/waive`, record both in the ledger | EX + FE |
| B9 | Honesty | Demo mode `?demo=1` works on the deployed build and fabricates sessions/vaults; vault cards invent `8XK…` ids | HIGH | S | A judge can land in fake data; screenshots can show fake ids | `src/lib/apiClient.ts:34-43`; `mockAuth.ts:198-211`; `components/dashboard/data.tsx:71` | Gate demo mode to non-production builds and delete the fabricated id | FE |
| B10 | Architecture | Two PayPal implementations (Express `paypal.routes.ts`, FastAPI `api/routes/paypal.py`) with unclear ownership; two backends for one product | HIGH | M | Confusion, double-source risk, wasted deploy surface | `backend/src/paypal/*`; `vaultpay_m3_ai_engine/app/api/routes/paypal.py` | Declare Express the only money authority; strip/disable the Python PayPal router or document it as a prototype | AI + EX |
| B11 | Frontend | No CSP or security headers on the SPA | MEDIUM | S | Not visible, but an easy judge question | live headers, `03-live.md` §4; `vercel.json` | Add `headers` in `vercel.json` (CSP, nosniff, frame-ancestors, referrer) | INFRA |
| B12 | Payout profile | Payouts go to the login email; no payout-address field or route | MEDIUM | M | A freelancer with a different PayPal email cannot be paid | `money/access.ts:freelancerEmail`; `docs/phase2-map.md:189` | Add `paypal_payout_email` to `users`, `GET/PUT /auth/me/payout-profile`, use it in `ensurePayout` | EX + FE |
| B13 | Settings | Sessions, MFA, notification prefs are frontend mocks; 2FA QR labelled MOCK | MEDIUM | L | Security story is partial | `SecurityCard.tsx:475`; `lib/api.ts:1322-1380` | Either implement or remove the rows before a judge clicks them | FE (+EX) |
| B14 | Money | Fee breakdown is not exposed; fee lines are EST only | MEDIUM | S | Fee arithmetic is unverifiable in the UI | `components/payments/FeeCalculator.tsx:79-83`; `vault_captures` columns | Expose capture fees on the vault/payout read and mark real vs estimated | EX + FE |
| B15 | Account | Delete blockers are prose; no structured list | MEDIUM | S | Blocked-delete modal cannot link to the offending vaults | `auth.service.ts:deleteAccount` | Add `details.blockers[] = {id,title,status}` | EX |
| B16 | Freelancer | Staging URL, remind, duplicate, delete draft do not exist; drawer buttons are mock with no label | MEDIUM | M | A judge clicking them sees fake success | `mockApi.ts:469`; `NewVaultDrawer.tsx:542` | Implement staging check (SSRF-safe) or remove the buttons | FE + EX |
| B17 | Tests | Playwright suite is not green; failing specs observed on reset and freelancer settings | MEDIUM | M | A red suite undermines the "tested" claim | `03-live.md` §6.1; `.tmp/audit-playwright.log` | Fix the two specs or their fixtures, then make the suite a gate | FE |
| B18 | CI | No CI at all; deploys are "push and hope" | MEDIUM | S | Regressions reach production (as the ledger duplication did) | no `.github/`; `glob **/*.yml` | GitHub Actions: typecheck + unit + build on PR, e2e on main | INFRA |
| B19 | Secrets hygiene | No root/backend `.env.example`; ES secrets on an app that never uses them; Postman env export may hold tokens; `@prisma/client` unused | MEDIUM | S | Onboarding and audit friction; extra attack surface | `00-inventory.md` §3; `backend/package.json` | Add `.env.example` files, drop unused secrets/deps, sanitise the Postman environment before sharing | EX + INFRA |
| B20 | AI tests | Python engine tests were not run; dependencies and keys absent in this environment | MEDIUM | S | Engine claims untested here | `vaultpay_m3_ai_engine/tests/*` | Create a venv, `pip install -r requirements.txt`, run pytest, record results | AI |
| B21 | Chat | Question counter/limit not persisted or enforced; `cached` always false | LOW | M | The 15-question promise is not real | `vault.actions.ts:574` | Persist `questions_used`, enforce with 429, return truthful `cached` | EX |
| B22 | Live data | No SSE/websocket; the dashboard polls while visible | LOW | M | Acceptable at demo scale | `src/lib/reads.ts` (`shouldPoll`) | Keep polling; document it | FE |
| B23 | Uploads | ZIP validator does not detect symlink entries, nested archives, or lying header sizes | LOW | S | Security-review nit | `uploads/zip.validator.ts:41-99` | Reject non-regular entries; depth-limit nested zips; measure decompressed bytes | EX |
| B24 | Ops | `fly.toml` region `fra`, machine in `cdg`; no documented backup/restore; RLS unverified | MEDIUM | M | Data-loss exposure | `backend/fly.toml:5`; no RLS files | Align region; document Supabase backups; verify RLS or state service-role-only | INFRA |
| B25 | Repo noise | `steps/` (52 files), `.shots/` (321 images), `backup/`, `.tmp/`, `test-results/` clutter the tree; two mojibake branch names | LOW | S | Slower review; confusing history | `00-inventory.md` §1-2 | Archive `steps/`, gitignore screenshots/logs, delete bad branches | ME/INFRA |
| B26 | Docs | README claims 26 tests and a `?demo=1` quick start; no honest-limits section; no demo video in repo | LOW | S | Judge reads stale claims | `README.md` | Rewrite with real counts, limits, and the demo script from `06-plan.md` | ME |
| B27 | Sponsors | Postman collection exists and AG Grid is genuinely used; no evidence of APIMatic, Zapier or Kernel integration | MEDIUM | M | Sponsor rubric points lost | `postman/`; `package.json` (ag-grid) | Add the missing integrations or drop the claims | ME/FE |
| B28 | Live proof | The full money loop has unit coverage but no recorded live capture/payout run after the latest claim changes | HIGH | M | Cannot honestly claim "proven on Fly" | `backend/tests/*`; `04-flows.md` Flow 5 | Run one sandbox capture → payout and save the ledger/vault ids as evidence | ME |

## Confirmation status of the items you named

| Known item | Confirmed? | Note |
|---|---|---|
| `vaults.paypal_capture_id` never written | **PARTIAL** | the write exists (`money.store.ts:116`) but its error is ignored; a prior live read suggested it was not landing. Needs one authenticated read to settle (B3) |
| `DELETE /auth/me` returns "User not found" | **FIXED in code** | the auth-user-already-gone case is tolerated (`auth.service.ts:deleteAccount`); not re-tested live |
| Failed checks cannot be waived or revised | **CONFIRMED** | B8 |
| Two backends, unclear state/PayPal ownership | **CONFIRMED** | B10, plus a second PayPal router in Python |
| AI service naming (`vaultpay`) and public exposure | **PARTIAL** | the engine is not deployed at all; when deployed it is internal-only with `x-internal-key`, but the brand in code/README is `VaultPay` |
| Random mock errors can fire in production | **NOT CONFIRMED** | `FX.mockErrors` is a literal `false` (`src/config/fx.ts:30`), so the 5 % failure paths are unreachable; the real production risk is demo mode (B9) |
| Phase-1 money loop never proven on Fly | **CONFIRMED for this audit** | no live capture was performed here (read-only); unit tests pass, live capture is UNVERIFIED (B28) |
| Playground / judge path | **MISSING** | `/playground` redirects or says it moved (`src/App.tsx:33-43`) |
| Sponsor deliverables | **PARTIAL** | Postman ✓, AG Grid ✓, APIMatic/Zapier/Kernel ✗ |
| README, license, demo video, honest limits | **PARTIAL** | LICENSE present; README stale; no video; no limits section |

## Batch 1 status (2026-11-06)

Fixed on branch `fix/batch1-security-money`, one commit per item:

| Gap | Commit | What the fix does |
| --- | --- | --- |
| B1 | `ecf2544` | no JWT fallback; production refuses to start without a 32+ char secret; a token without a live session row is 401; algorithm pinned |
| B4 | `659544c` | reject voids the authorization first and only cancels on success; void/expired confirmed via getAuthorization; client-only |
| B7 | `142ac27` | one idempotent claim routine for return, reconcile and `PAYMENT.AUTHORIZATION.CREATED` |
| B3 | `acccd70` | id writes throw `MONEY_WRITE_FAILED`; `scripts/backfill-paypal-ids.mjs` (dry-run default) |
| B9 | `4d1b40e` | demo mode only in dev or `VITE_ENABLE_DEMO=true`; invented `8XK` ids removed from cards |
| B10 | `8798808` | FastAPI PayPal router no longer registered |

Verification at that commit: backend 16 files / 73 tests, frontend 12 files / 68 tests, both typechecks clean, secrets scan clean, production boot without `JWT_SECRET` exits 3.

Live evidence gathered after the code fix, supporting B4's severity: authorization `8WL58666GM8569742` is still `CREATED` for $23.00 and expires 2026-12-04T17:02:23Z (see `03-live.md` §10).
