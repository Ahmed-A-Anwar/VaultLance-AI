# Live E2E results

Run started 2026-11-07T18:20:55Z against:

- Frontend: https://vault-lance-ai.vercel.app
- API: https://vaultlance-ai.fly.dev/api
- PayPal: sandbox only
- Runner: `node --env-file=backend/.env --env-file=backend/.env.E2E scripts/e2e-live-v2.mjs`
- Raw evidence: `docs/e2e/evidence/results.json` (gitignored)

## Money loop

| Step | Result | Evidence |
|---|---|---|
| Freelancer sign-in, payout, create/submit/invite; client joins | **PASS** | real 324-byte zip uploaded; manifest returned; UI join answered |
| Client starts payment; sandbox buyer approves | **PASS** | order ended …562Y; authorization …472D |
| Vault reaches AUTHORIZED | **PASS** | status AUTHORIZED |
| Audit, approve, PAID, download; pre-PAID download 403 | **PASS** | gross $25; pre-PAID 403; signed download 200; body amount 0.01 ignored; restart PAID_AFTER_RESTART |
| Payout reaches paid and shows for freelancer | **PASS** | payout …ZT8U |
| Second vault authorizes, rejects, PayPal void confirmed, files stay locked | **PASS** | PayPal VOIDED; wrong-state 409; download 403 |
| Replay, invalid signature, wrong user/state, ignored amount, restart | **PASS** | signature 400; wrong user 403; wrong state 409; replay no second payout; restart PAID_AFTER_RESTART |

**Summary: 7/7 steps passed.** Captures used: 3 paid (the per-run cap).

## Attack and failure cases

`node --env-file=backend/.env --env-file=backend/.env.E2E scripts/e2e-security.mjs` — **20/20 passed**
(evidence `docs/e2e/evidence/security.json`, ignored).

| Group | Result | Notes |
|---|---|---|
| A: registration abuse | **PASS** | duplicate 409; weak 400; missing 400; role ADMIN 400; wrong password 401 |
| B: token and reset | **PASS** | tampered bearer 401; reset request identical for known/unknown; forged token inspect `invalid` and confirm 400 `RESET_TOKEN_INVALID` |
| C: happy path setup | **PASS** | upload 201; submit locks sha256; invite code `VL-…`; invited client joins |
| D: IDOR and roles | **PASS** | stranger read 403, files 403, approve 403; client cannot mint invite 403; stored `<img onerror>`/`<svg onload>` never executed |
| E: origin, CORS, webhook | **PASS** | foreign-origin mutation 401 with no `set-cookie` (bearer-only, no ambient credential); no ACAO for evil origin; unsigned webhook 400 |

Two earlier red lines were test defects, not product defects: `GET /auth/password-reset/:token`
intentionally answers 200 with `state:"invalid"` (the page shows a reason), and the origin case
expected a CSRF refusal on an API that sets no cookies. The suite now asserts the properties that
actually matter (a forged token cannot reset; a foreign page has no session to ride).

## Smoke

`npm run e2e:smoke` — **9/9 in 11s** (target < 8 min). Covers health, two registrations, vault
create, upload, manifest lock, invite, join, pre-payment download 403, stranger 403. It stops
before PayPal by design.

## UI probe

- Freelancer signup through `/signup` succeeded warm: 201 in 1.63s, success card in 3.07s.
- The create/upload drawer accepted a real zip, passed all four local scan rows, created the vault,
  uploaded it, and invited a pre-registered client.
- The invite path requires the client account to exist first; the drawer reports the server’s message when it does not.
- The drawer’s accessible name changes from “New vault” to “Vault created”; the Done button must be
  addressed globally, not inside the old dialog name.

## Defects found and fixed

| Defect | Root cause | Fix |
|---|---|---|
| Cold-start signup showed “The server took too long to answer” while the API created the account | `src/lib/http.ts` 10s default; `register`/`login` used it, so a Fly cold start outlived the browser deadline | `src/lib/authApi.ts` gives auth calls 45s; regression test `src/lib/authApi.test.ts` proves the abort fires past 20s |
| “Copy invite link” did nothing and copied a bare code when it did work | `navigator.clipboard` rejection was unhandled (no fallback, no message); the button wrote the code, not a `/v/<code>` link | `NewVaultDrawer.tsx`: clipboard fallback via selection, honest error toast, and the button now copies `${origin}/v/<code>` |

Verification after the fixes: frontend typecheck 0, unit **75/75**, security **20/20**, smoke **9/9**.

## Open items

- Valid password-reset delivery remains **HUMAN** (no inbox / Supabase test link); the token path
  itself is covered above.
- PayPal business balance remains **HUMAN** (balance API returned 403).
- The full runner still uses API setup for some writes; browse-first create/upload/invite is proven
  separately by the UI probe.
- Test data from these runs is not deleted (no vault-delete endpoint). Leftovers are all prefixed
  `e2e-<timestamp>-` on accounts, vaults and files, in the sandbox/dev database.
