# Phase 2 — frontend → real API map

Status: **proposal, awaiting approval.** Nothing in the app is wired yet; `FX.real` does not exist.
Source of truth: `backend/src/**` at `11e6055` and the live API at `https://vaultlance-ai.fly.dev`.
Frontend commit for this map: `feat/phase2-real-api` off `origin/main` (`11e6055`); rollback tag `phase2-pre` = `11e6055`, the branch base. (STEP 0 tagged `ff52fca`, which main had already moved past by two auth-token commits; the old ref is kept as `phase2-pre-ff52fca`.)

Verdicts: **CONNECT** (call it, shapes already match) · **ADAPT** (call it, map the payload) · **GAP** (backend lacks it — keep the mock).

---

## §a Preconditions (verified live, 2026-11-05)

| Check | Result |
|---|---|
| `GET https://vaultlance-ai.fly.dev/health` | `status: healthy`, `version: phase1-money-loop`, `databaseHealthy: true` |
| CORS preflight `OPTIONS /api/vaults` from `https://vault-lance-ai.vercel.app` | `204`, `access-control-allow-origin` echoes that origin, `-allow-credentials: true`, `-allow-headers: authorization,content-type` |
| CORS from a foreign origin (`example.com`) | no `access-control-*` headers at all — refused, no wildcard |
| Auth mechanism | **Bearer JWT** in the `Authorization` header. No cookies are ever set, so SameSite/Secure do not apply and cross-site works. |
| Login / logout | `POST /api/auth/login` → `{ user, token, sessionId, expiresIn: "7d" }`; `POST /api/auth/logout` (bearer) revokes the server-side session row |
| Token lifetime | `7d` (`JWT_EXPIRES_IN ?? "7d"`). `config.jwt.refreshExpiresIn` is declared (`30d`) but **no refresh route exists** — the frontend re-authenticates when the token expires. |
| Frontend origin allowed | yes: `https://vault-lance-ai.vercel.app`. No `FRONTEND_ORIGINS` change needed. |
| Where the base URL comes from | `src/lib/apiClient.ts`: `VITE_API_URL` if set, else `/api` on the deployed origin, else `http://localhost:3000/api` in dev. No `.env*` file exists in the repo; the deployed value lives in the Vercel project env. |

No blocker in §a.

---

## §b Public route inventory

All routes are JSON; every success body is `{ success, message, data }`. "Auth" = `Authorization: Bearer <jwt>` required.

| Method & path | Auth | Request | Response `data` |
|---|---|---|---|
| `POST /api/auth/register` | — | `{email, password, fullName, role?}` | `{user, token, sessionId, expiresIn}` |
| `POST /api/auth/login` | — | `{email, password}` | `{user, token, sessionId, expiresIn}` |
| `POST /api/auth/logout` | bearer | — | `{loggedOut:true}` |
| `POST /api/auth/password-reset/request` | — | `{email}` | `{sent:true, devResetUrl\|null}` (same answer for every address) |
| `GET /api/auth/password-reset/:token` | — | — | `{state:"valid"\|"expired"\|"invalid"}` |
| `POST /api/auth/password-reset/confirm` | — | `{token\|accessToken, password}` | `{changed:true}` |
| `GET /api/auth/me` | bearer | — | `{id, email, fullName, role, avatarUrl, createdAt}` |
| `PATCH /api/auth/me` | bearer | `{fullName}` | same as `me` |
| `POST /api/auth/me/password` | bearer | `{currentPassword, newPassword}` | `{changed:true}` |
| `GET /api/auth/me/export` | bearer | — | account payload (profile, vaults, events…) |
| `DELETE /api/auth/me` | bearer | `{email}` | `{deleted:true}`; `409` with a prose reason while a vault or payout blocks it |
| `POST /api/vaults/:id/payment/order` | bearer | `{returnUrl?, cancelUrl?}` | `{orderId, status, links[], amount, currency}` |
| `POST /api/vaults/:id/payment/authorize` | bearer | `{orderId}` | `{vaultId, orderId, authorizationId, status:"AUTHORIZED", amount, currency}` |
| `POST /api/vaults/:id/capture` | bearer | — | `{vaultId, status:"PAID", captureId, payoutCents, payoutStatus}` |
| `POST /api/vaults/:id/void` | bearer | `{authorizationId?}` | `{vaultId, status:"CANCELLED", voided:true}` |
| `POST /api/vaults/:id/authorize` | bearer | — | full vault; **legacy, no PayPal call — must not be used** (see G11) |
| `POST /api/vaults/:id/approve` | bearer | `{overrideFailures?}` | full vault; message carries `captureId` + `payoutStatus` |
| `POST /api/vaults/:id/reject` | bearer | — | full vault (`status: CANCELLED`) |
| `POST /api/vaults/:id/audit` | bearer | — | `{route:"/vault/:id"}` (no state change) |
| `GET /api/vaults/:id/audit-detail` | bearer | — | `{vault{id,title,description,amount,currency,status,paypalOrderId,paypalCaptureId}, files[], checks[], suggestions[], questionsUsed, questionLimit}` |
| `POST /api/vaults/:id/checks/run` | bearer | — | `{checks[]}`; moves SUBMITTED→VERIFYING→AWAITING_APPROVAL |
| `POST /api/vaults/:id/chat` | bearer | `{question}` | `{text, sources[], cached}` |
| `POST /api/vaults/:id/invite-code` | bearer + FREELANCER owner | — | `{vaultId, code:"VL-XXXX-XXXX", expiresAt}` |
| `POST /api/vaults/:id/join` | bearer + CLIENT | `{code}` | `{vaultId, joined:true, status}`; wrong/used/expired code → the same `404 INVITE_INVALID` |
| `POST /api/vaults/:id/submit` | bearer (owner) | — | `{manifestSha256, fileCount, totalSizeBytes}` (idempotent) |
| `GET /api/vaults/:id/files/:fileId/download` | bearer + member | — | `{url, fileName, expiresIn:60}`; `403 VAULT_NOT_PAID` before PAID |
| `POST /api/vaults` | bearer + FREELANCER | `{title, description?, amount, currency?, expiresAt?}` | `VaultDTO` |
| `GET /api/vaults` | bearer | — | `VaultDTO[]` (owner or member; newest first) |
| `GET /api/vaults/:id` | bearer + member | — | `VaultDTO` = `{id, freelancerId, title, description, amount, currency, status, expiresAt, createdAt, updatedAt, members[], files[]}` |
| `PATCH /api/vaults/:id` | bearer + FREELANCER owner | `{title?, description?, amount?, status?}` | `VaultDTO`; terms frozen after `AWAITING_CLIENT` |
| `POST /api/vaults/:id/invite` | bearer + FREELANCER owner | `{clientEmail}` | `VaultDTO`; `404 CLIENT_NOT_FOUND` if the client has not registered |
| `POST /api/vaults/:id/accept` | bearer + CLIENT | — | `VaultDTO` (PENDING → ACCEPTED) |
| `POST /api/uploads/:vaultId` | bearer + FREELANCER | multipart, field `file` | `{fileId, vaultId, fileName, storageKey, mimeType, fileSize, sha256Hash, isZipArchive, zipDetails?}` |
| `GET /api/uploads/download/:fileId` | bearer | — | raw bytes (only when the vault is PAID) |
| `GET /api/uploads/vault/:vaultId/files` | bearer + member | — | `[{id, vaultId, fileName, mimeType, fileSize, createdAt}]` (no hash) |
| `GET /api/manifests/:vaultId` · `POST /api/manifests/:vaultId/verify` | bearer | — | manifest + canonical hash; reproducibility check |
| `GET /api/ledger` | bearer | — | `ledger_events[]`, newest first, **limit 50, not scoped to the caller** (see G1) |
| `GET /api/ai/health` | bearer | — | proxy health of the private AI service (never its address or key) |

Not for the browser: `POST /api/webhooks/paypal` (raw body, PayPal signature).

---

## §c Status mapping — backend vault state → the five UI statuses

| Backend | UI | Note |
|---|---|---|
| `DRAFT` | `awaiting_payment` | |
| `AWAITING_CLIENT` | `awaiting_payment` | invited, not joined |
| `AWAITING_AUTHORIZATION` | `awaiting_payment` | joined, hold not placed |
| `AUTHORIZED` | `held` | money is held |
| `IN_PROGRESS` | `held` | |
| `SUBMITTED` | `audited` | delivered, review open |
| `VERIFYING` | `audited` | checks running |
| `AWAITING_APPROVAL` | `audited` | report ready, client decides |
| `CAPTURE_PENDING` | `audited` | **correction**: today's mapper folds this into `unlocked`, which would unlock files before the capture lands. It must read as in-review until the server says `PAID`. |
| `PAID` | `unlocked` | the only state that unlocks downloads |
| `CANCELLED` | `voided` | |
| `EXPIRED` | `voided` | |
| `NEEDS_REVISION` | **no equivalent** | proposal: `audited` (still under review). Needs your call. |
| `DISPUTED` | **no equivalent** | proposal: `voided` (frozen, nothing unlocks). Needs your call. |
| anything unknown | `voided` + one `console.warn` | never crash, never guess into `unlocked` |

`PayoutStatus` (`none · creating · pending · paid · failed · blocked`) has no UI status of its own; it feeds `phaseOf()` through `payoutStatus` (`pending`, `paid`, `failed` — `blocked` renders as `failed` with the server's reason).

---

## §d Money mapping

- **Vault amount**: `vaults.amount` is a decimal **dollar** number, not cents, in `VaultDTO`. The frontend keeps `amountCents` and rounds once at the boundary (`Math.round(amount * 100)`). This is the one place a value is converted; no charge is ever computed client-side.
- **Cents exist server-side** in the money loop only: `getVaultMoney().amountCents`, capture `grossCents` / `netCents`, `vault_payouts.payout_cents`.
- **Platform fee**: `round(gross × 0.05)`, applied inside `freelancerPayoutCents(gross, net)`. PayPal's fee is the *actual* difference (`gross − net`), not a fixed 5.4% + 30¢.
- **Exposed money fields**: `amount` (vault, dollars) · `payoutCents` (integer, approve/capture response) · `payoutStatus`. **Not exposed**: gross, platform fee, PayPal fee, `netCents`. A fee breakdown needs the gap in G2.
- **`fees.ts` stays EST only.** Its 5.4% + 30¢ is a pre-capture guess; once `payoutCents` arrives from the server, the UI prints that instead. The three EST labels stay wherever a number is still an estimate.
- **Currency**: `USD` in every live row; `currency` is carried through, never assumed.

---

## §e Timestamps

- Server format: ISO-8601 UTC strings (`createdAt`, `updatedAt`, `expiresAt`, `created_at`). No timezone field, no locale formatting from the server.
- Every frontend `ts` is epoch milliseconds: `Date.parse(iso)`, and anything non-finite becomes `undefined` → the UI prints `—`. No `NaN` reaches a `Date`.
- Relative labels stay computed in the browser from those ms values.

---

## §f Function map — `src/lib/api.ts` (client dashboard, audit room, payments, settings)

| Function | Endpoint | Mapping | Verdict | Why |
|---|---|---|---|---|
| `getKpis` | `GET /api/vaults` | sum held/audited, count review | ADAPT | no KPI route; derive from adapted rows, one selector for all three totals |
| `listVaults` | `GET /api/vaults` | `VaultDTO[] → Vault[]` | CONNECT | shape already exists (`backendVaultToFrontend`) |
| `listEvents` | `GET /api/ledger` | `event_type → LedgerType` | GAP | response is not scoped to the caller (G1) |
| `getVaultDetail` | `GET /api/vaults/:id/audit-detail` | vault/files/checks/suggestions | ADAPT | no `freelancerName`, no message history; both handled as `—`/empty |
| `listFiles` | `.../audit-detail` or `GET /api/uploads/vault/:id/files` | name/size/hash | ADAPT | only the audit-detail shape carries `sha256` |
| `downloadVaultFile` | `GET /api/vaults/:id/files/:fileId/download` | signed URL, 60s | ADAPT | needs `vaultId` (signature change), never cached |
| `runChecks` | `POST /api/vaults/:id/checks/run` | server checks | CONNECT | server already returns id/name/detail/source/result/rows |
| `askAI` | `POST /api/vaults/:id/chat` | `{text, sources, cached}` | ADAPT | one-shot, no stream, no cache flag, no enforced limit (G4) |
| `auditVault` | `POST /api/vaults/:id/audit` | `{route}` | CONNECT | |
| `authorizeVault` | `POST .../payment/order` + `.../payment/authorize` | redirect + approve | ADAPT | two-step PayPal flow; the legacy `/authorize` must not be used |
| `approveVault` | `POST /api/vaults/:id/approve` | full vault | CONNECT | capture is real; `payoutStatus` only in the message → re-read the vault |
| `rejectVault` | `POST /api/vaults/:id/reject` | `CANCELLED` | CONNECT | |
| `markAudited` | — | — | GAP | dev-panel helper; audit now moves the vault server-side |
| `joinVault` | `POST /api/vaults/:id/join` | `{code}` | GAP | the UI knows only the code, the route needs the vault id (G3) |
| `subscribe` | — | — | GAP | no SSE/WS feed; poll (1.3) |
| `simulateWebhook`, `devVaultIds` | — | — | dev only | stay local, hidden in PROD |
| `getSettings` | `GET /api/auth/me` | profile | ADAPT | preferences/2FA/sessions stay local |
| `updateProfile` | `PATCH /api/auth/me` | `{fullName}` | CONNECT | |
| `changePassword` | `POST /api/auth/me/password` | — | CONNECT | |
| `exportData` | `GET /api/auth/me/export` | blob | CONNECT | |
| `deleteAccount` | `DELETE /api/auth/me` | `{email}` | CONNECT | 409 reason is prose → G6 |
| `listDeleteBlockers` | derived from `GET /api/vaults` | filter held/audited | ADAPT | server's 409 carries no ids |
| `updatePayoutProfile` | — | — | GAP | no payout-email field on the account (G8) |
| `updatePayoutPrefs`, `updatePreferences`, `updateNotifications` | — | — | GAP | no preference storage; remain local |
| `listSessions`, `revokeSession`, `revokeOtherSessions` | — | — | GAP | no session list/revoke API (G9) |
| `startTwoFactor`, `confirmTwoFactor`, `disableTwoFactor` | — | — | GAP | no MFA endpoints (G9) |
| `paypalId()` (mock id generator) | — | — | dev only | removed from real paths |

## §g Function map — freelancer surface (`components/freelancer`)

| Function | Endpoint | Verdict | Why |
|---|---|---|---|
| `listFreelancerVaults` | `GET /api/vaults` | CONNECT | `liveApi.ts` already maps it |
| `listFreelancerEvents` | `GET /api/ledger` | ADAPT → blocked | needs G1 first |
| `getFreelancerKpis` | selectors over vaults | ADAPT | same earnings selectors as Overview/Earnings/Payments |
| `createVault` | `POST /api/vaults` | CONNECT | `amountCents / 100`; server validates ≥ 0 |
| `updateVault` | `PATCH /api/vaults/:id` | ADAPT | terms frozen after invitation |
| `deleteDraft` | — | GAP | no DELETE vault route |
| `duplicateVault` | — | GAP | no duplicate route |
| `scanArchive` | `POST /api/uploads/:vaultId` | ADAPT | server returns hash + zip details; the four scan steps render from its verdict |
| `addStagingUrl` | — | GAP | no staging-url route |
| `inviteClient` | `POST /api/vaults/:id/invite-code` | ADAPT | code is minted server-side (7d); email invite is a separate route |
| `submitForReview` | `POST /api/vaults/:id/submit` | CONNECT | real manifest SHA-256, idempotent |
| `remindClient` | — | GAP | no remind route |
| `retryPayout` | — | GAP | `ensurePayout(vaultId,{retry})` is service-only, no HTTP route (G2) |
| `subscribe` / `simulate*` | — | GAP / dev | poll; simulators stay behind the dev panel |

## §h Auth (wiring detail)

Register, login, logout, me, password reset (request/inspect/confirm), change password, profile update, export and delete all exist and are already reachable through `apiClient.auth`. The frontend change is storage and error mapping, not new endpoints:
role comes from `GET /api/auth/me` (server profile), the session token moves to memory (Slice 4), `401` clears and routes to `/signin` with the intended path in router state, and no message may reveal whether an email exists (the server already answers identically for reset).

---

## §i Gap list for the backend team

| # | Needs | Method & path | Fields / behaviour | Blocks |
|---|---|---|---|---|
| G1 | Ledger scoped to the caller | `GET /api/ledger` | today `select * limit 50` across **all** users — other people's amounts and notes are in the response. Needs membership scoping (or `?vaultIds=`) | client + freelancer events (SECURITY) |
| G2 | Payout read + retry | `GET /api/vaults/:id/payout`, `POST /api/vaults/:id/payout/retry` | `{status, amountCents, reason, payoutItemId, attempt}`; retry allowed only from `failed` | payout card, "Retry payout" |
| G3 | Join by code | `POST /api/vaults/join` | `{code}` → `{vaultId, status}`; generic error for wrong/used/expired | client "join with code" |
| G4 | Chat counter + real cache flag | `POST /api/vaults/:id/chat`, `GET .../audit-detail` | persist `questionsUsed`, enforce 15 (429/409), return `cached` truthfully; currently hardcoded `0`/`15`/`false` | question limit + DEMO CACHE chip |
| G5 | Fee breakdown | `GET /api/vaults/:id/money` | `{grossCents, platformFeeCents, paypalFeeCents, netCents, payoutStatus}` | non-EST fee lines |
| G6 | Structured delete blockers | `DELETE /api/auth/me` 409 | `error.details.blockers[] = {id, title, status}` (today: prose only) | blocked modal rows/links |
| G7 | PayPal ids on the vault read | `GET /api/vaults/:id` | add `paypalOrderId`, `paypalCaptureId` (only `audit-detail` has them) | receipt outside the audit room |
| G8 | Payout address on the account | `GET/PUT /api/auth/me/payout-profile` | no such column exists; payouts use the login email | Settings payout card |
| G9 | Sessions, MFA, notification prefs | `GET /api/auth/me/sessions`, `DELETE .../:id`, `/mfa/*`, `/me/notifications` | none exist | those Settings rows stay MOCK |
| G10 | Event feed | SSE `GET /api/events` or Supabase Realtime | none; polling only | live updates |
| G11 | Remove/guard the legacy authorize | `POST /api/vaults/:id/authorize` | moves a vault to `AUTHORIZED` with **no PayPal call**, for any member incl. the freelancer | must never be wired; worth closing server-side |
| G12 | Staging URL, remind, duplicate, delete draft | `POST .../staging-url`, `.../remind`, `.../duplicate`, `DELETE /api/vaults/:id` | none exist | those freelancer actions stay mock |

## §j Audit room chat: what the UI wants vs what the API gives

| Need | API today | Plan |
|---|---|---|
| Streaming tokens | one JSON response, no SSE/WS | render the full answer with the existing local typing effect (cosmetic) |
| Source chips | `sources: ["FILE INDEX" \| "TEST LOG" \| "PIXEL SCAN" \| "VAULT DATA"]` | validate against the known chip set; unknown chips dropped (no invented chip) |
| DEMO CACHE chip | `cached: false` always, answers are deterministic templates | show the chip only if the server ever says `cached: true`; otherwise none |
| 15-question limit | `questionLimit: 15`, `questionsUsed: 0`, not persisted, not enforced | mirror the server's counter; do not enforce client-side beyond what it returns (G4) |
| Untrusted text | answers contain `**bold**` and `•` bullets | render as plain text with the markers stripped; never `dangerouslySetInnerHTML` |
| Provenance per criterion | checks carry `source` + `rows[]` | shown as-is |

## §k Proposed wiring order (behind flags)

1. `FX.real.auth` + `http.ts` + flags (Slice 2/4) — nothing else changes.
2. `FX.real.vaultsRead` — `listVaults`, `getVaultDetail`, KPI selectors (events excluded until G1 is answered).
3. `FX.real.uploads` → `submit` → `invite-code`/`invite` (freelancer).
4. `FX.real.payments` — order → redirect → confirm → approve/reject.
5. `FX.real.audit` — checks + chat (plain text, no cache chip).
6. `FX.real.payouts` — blocked on G2; stays mock until it exists.
7. `FX.real.settings` — profile/password/export/delete real; the rest labelled MOCK.

Rows that stay mock after this phase: ledger events (G1), payout retry (G2), join-by-code (G3), fee breakdown (G5), sessions/MFA/notifications/payout address (G8/G9), staging URL/remind/duplicate/delete-draft (G12), dev simulators (dev-only), and `markAudited`.
