# 06 — Gap-closing plan

Phases continue the project's own numbering. Each row is a gap ID from `05-gaps.md`.
The plan assumes one developer working with this agent; sizes are in `05-gaps.md` (S/M/L).

## 1. Phases

### P3 — Reality proof (the money loop, honestly proven)
Goal: one recorded sandbox run from hold to payout, and no silent money failures.

| Gap | Work |
|---|---|
| B1 | Set `JWT_SECRET` on Fly, remove the fallback, force re-login |
| B3 | Check every Supabase update error; backfill `paypal_order_id/authorization_id/capture_id` from the ledger |
| B4 | Reject voids the authorization |
| B7 | Webhook `PAYMENT.AUTHORIZATION.CREATED` claims the hold |
| B28 | One live capture → payout run, ids recorded in `docs/audit/evidence/` |
| B5 | `GET /:id/payout` + surface status/reason/retry |

### P4 — AI engine (make the AI claim true, or retire it)
| Gap | Work |
|---|---|
| B2 | Deploy `vaultlance-ai-engine` with `INTERNAL_API_KEY` + `ANTHROPIC_API_KEY`; call it from `checks/run` and `chat`; keep the deterministic checks as the fallback and label which produced the verdict |
| B20 | Run the Python test suite in a venv and record results |
| B10 | Decide ownership: Express owns money; the Python PayPal router is marked prototype or removed |
| B21 | Persist/enforce the 15-question limit; truthful `cached` |

### P5 — Judge path
| Gap | Work |
|---|---|
| B6 | `POST /api/vaults/join { code }` + wire `JoinRow` |
| B9 | Demo mode only outside production; remove fabricated ids |
| — | `/playground` becomes a guided 3-minute path (new vault → funded demo → audit → approve) or is deleted |
| B26 | README honest limits + demo script |

### P6 — Missing screens and actions
| Gap | Work |
|---|---|
| B8 | Waiver + revision routes and UI |
| B12 | Payout address on the account, used by `ensurePayout` |
| B13 | Sessions/MFA/notifications: implement or remove |
| B14 | Real fee breakdown on the receipt |
| B15 | Structured delete blockers |
| B16 | Staging URL (SSRF-safe), remind, duplicate, delete draft — or remove |

### P7 — Security pass
| Gap | Work |
|---|---|
| B1 | (repeat) secret hygiene check across both apps |
| B11 | CSP and headers on Vercel |
| B19 | `.env.example` files, prune secrets, remove unused Prisma, sanitise Postman |
| B23 | ZIP symlink/nesting/measurement |
| B24 | RLS verification or documented service-role-only model; backup/restore doc |

### P8 — Sponsors and artefacts
| Gap | Work |
|---|---|
| B27 | Postman collection is done; add APIMatic/Zapier/Kernel only if they are genuinely integrated, otherwise drop the claim |
| — | Demo video (3 min), screenshots, architecture diagram, LICENSE check |

### P9 — Ship
| Gap | Work |
|---|---|
| B17 | Make Playwright green |
| B18 | GitHub Actions: typecheck + unit + build on PR; e2e on main |
| B25 | Archive `steps/`, gitignore `.shots/`/logs, delete mojibake branches |
| — | Freeze, tag `v1.0.0`, publish |

## 2. Schedules

### 7 days (minimum credible submission)
| Day | Work |
|---|---|
| 1 | P3: B1, B3, B4 (`JWT`, id persistence, reject-void) |
| 2 | P3: B7 webhook claim, then B28 live capture run |
| 3 | P3: B5 payout read; P5: B6 join-by-code |
| 4 | P4: B2 deploy the engine and wire `checks/run` only (leave chat templates) |
| 5 | P5: B9 demo gating, judge path, README limits |
| 6 | P7: B11, B19, B23; P9: B17 fix the two failing specs |
| 7 | B18 CI, B25 cleanup, demo video, freeze + tag |

### 10 days (recommended)
Adds: day 8 — B8 waiver/revision; day 9 — B12 payout address + B14 fees; day 10 — B13/B15/B16 screen gaps and a second full sandbox run.

### 14 days (complete)
Adds: days 11–12 — B10 single PayPal authority, B13 real sessions/MFA if it stays; day 13 — B21 live updates or documented polling, B24 backups/RLS; day 14 — full regression, dry-run the demo twice, publish.

## 3. Cut list (in order, if time runs short)

1. B13 sessions/MFA/notifications — delete the rows rather than fake them.
2. B16 staging/remind/duplicate — remove the buttons.
3. B14 fee breakdown — keep the EST labels, they are honest.
4. B21 question limit — drop the counter from the UI.
5. B22 SSE — polling is fine.
6. B12 payout address — pay the login email and say so.
7. P8 sponsor extras — Postman + AG Grid only.

**Never cut:** B1, B3, B4, B7, B9, B28, B6. Those are the difference between a demo and a claim.

## 4. Demo script (3 minutes, safe today)

1. **0:00** Landing page — the instrument, one line of copy. Do not scroll through all clips (21 MB).
2. **0:20** Sign in as the freelancer (`freebufffreelancer@…`). Overview shows real vaults from the API.
3. **0:40** Open a funded vault → audit room. Show the hold amount, the file list, the checks (say "deterministic checks on the submitted files", not "AI").
4. **1:20** Sign in as the client in a second tab/incognito → the same vault. Approve. Capture runs on the server; the vault flips to PAID and the files unlock. Show the signed download.
5. **2:10** Freelancer → Earnings: the ledger rows are real (authorization, capture, payout). If the payout status is unknown, say "payout creation is automatic; status is verified at PayPal" rather than opening a card that has no server read.
6. **2:40** Close on the ledger + the honest-limits sentence.

**Avoid clicking in the demo:** Join by code (demo-only), "Try the demo project" (fake vault), settings sessions/2FA/notifications (mock), staging-URL/remind/duplicate/delete-draft in the vault drawer (mock, unlabelled), the payments fee breakdown (EST), `/console`, `/demo`, `/v/:token`.
**Do not run:** approve twice, reject a funded vault expecting money back (it stays held — B4), or delete an account with money in motion.

## 5. Honest limits (README paragraph)

> VaultLance AI runs on PayPal **sandbox** only; every endpoint is pinned to `api-m.sandbox.paypal.com` and a real capture is impossible in this build. The escrow loop is real in the sense that a PayPal authorization is created, claimed server-side, captured exactly once and recorded in a ledger; the payout is created automatically after capture but is paid to the freelancer's account email and can fail, in which case it is retryable by the owner. The audit checks are deterministic rules over the submitted files' names, types, sizes and SHA-256 hashes; the separate FastAPI/Claude verification engine in this repository is not part of the deployed path. Settings for sessions, two-factor and notification preferences are interface-only. Invite-by-code exists on the server but is not yet connected to the client dashboard. All figures shown as EST. are client-side arithmetic; the authoritative fees are written at capture time.

Adjust the AI sentence only after P4.

## 6. Questions for you

1. **Deadline** — 7, 10 or 14 days? The plan changes at each boundary.
2. **AI claim** — deploy the FastAPI engine and wire it (L), or reframe the pitch around deterministic checks (S)?
3. **Sponsors** — which are mandatory? APIMatic, Zapier and Kernel have no integration in the repo.
4. **Payout email** — is paying the login email acceptable, or must the payout address be a separate field?
5. **Demo mode** — keep `?demo=1` for judges (gated off in production), or remove it entirely?
6. **Join by code vs email invite** — which is the judged flow?
7. **Legacy surfaces** — delete `/console`, `/demo`, `/v/:token` or keep them?
8. **MFA/sessions** — implement for real or remove the rows?

## 7. Manual checks (only you can do these)

| # | Step | Expected |
|---|---|---|
| 1 | PayPal dashboard → sandbox app → Webhooks; compare with `https://vaultlance-ai.fly.dev/api/webhooks/paypal` and the event list in `webhook.service.ts:47-128` | Registered, all types enabled |
| 2 | `flyctl secrets set JWT_SECRET=<32+ random>` then restart; sign in again everywhere | Old tokens rejected |
| 3 | Sandbox personal account: approve the $23 vault, close the tab, then `GET /api/vaults/966d3c39-…` with a client token | Status `AUTHORIZED` without opening the room (after B7) |
| 4 | Approve → capture in the room; read `vault_captures` for the vault | One row, PayPal fee and payout cents present |
| 5 | Check the payout in the sandbox business account (Activity → Payouts) and read `vault_payouts` | `paid` or a `failed` row with a reason |
| 6 | Reject a funded vault, then inspect the authorization at PayPal | Voided (today: still held) |
| 7 | Vercel → Settings → Environment Variables | `VITE_API_URL`, `VITE_PAYPAL_CLIENT_ID` set for production |
| 8 | Supabase → Table editor → `vaults` for a funded vault | `paypal_order_id` / `paypal_authorization_id` populated |
| 9 | Supabase → Auth → Policies | RLS state recorded, or documented as service-role-only |
| 10 | Rotate the Postman environment's client secret if that export was shared | New secret in Postman only, never in git |
