# Backend wiring map

What exists on the servers, what the browser already calls, and what is still mock.
Verified against `origin/main` at `abb6a34` (fetched 2026-11-04); merge into
`fix/freelancer-routes` includes PR #8 "finish milestone 2".

## The three processes

| process | base | files |
|---|---|---|
| Vite dev | `http://127.0.0.1:5173` | everything under `src/` |
| Express API | `http://localhost:3000/api` | `backend/src/**` |
| FastAPI m3 engine | mounted routers, no client yet | `vaultpay_m3_ai_engine/app/**` |

CORS allows `5173`/`localhost` origins with a dev-friendly fallback, so no proxy
is needed for dev. Vite reads `VITE_API_URL`; two files ignore it (`src/lib/api.ts`,
`src/components/dashboard/data.tsx` hardcode `http://localhost:3000`) — unify on
`apiClient` before deploying anywhere.

## The contract

Every Express response is `{ success, message?, data?, error?, meta? }`
(`backend/src/shared/response.ts`); created resources answer `201` with the same
envelope. `src/lib/apiClient.ts` already models this as `ApiResponse<T>` and
returns `success: false` instead of throwing on 4xx/5xx — callers must check the flag.

Auth is a bearer token in `vl_token` (`localStorage` when "remember", otherwise
`sessionStorage`). `apiClient.getToken()` reads both. **No mock issues a token
today**, and every route outside `/health` and `/api/auth/*` sits behind
`requireAuth` (+ `requireRole`), so auth is the gate for all of it.

## Already live

| frontend | call | endpoint |
|---|---|---|
| `src/components/dashboard/data.tsx` | `fetchLiveVaults` | `GET /api/vaults` |
| `src/components/dashboard/data.tsx` | `fetchLiveLedger` | `GET /api/ledger` |
| `src/lib/api.ts` | `authorizeVault` | `POST /api/vaults/:id/authorize` |
| `src/lib/api.ts` | `approveVault` | `POST /api/vaults/:id/approve` |
| `src/lib/api.ts` | `rejectVault` | `POST /api/vaults/:id/reject` |
| `src/lib/api.ts` | `auditVault` | `POST /api/vaults/:id/audit` |
| `src/lib/api.ts` | `getVaultDetail` | `GET /api/vaults/:id/audit-detail` |
| `src/lib/api.ts` | `runChecks` | `POST /api/vaults/:id/checks/run` |
| `src/lib/api.ts` | `askAI` | `POST /api/vaults/:id/chat` |
| `src/components/shared/PayPalAuthorizeButton.tsx` | order create | `POST /api/vaults/:vaultId/payment/order` |

Note: `GET /api/ledger` reads Supabase and returns `[]` when Supabase is not
configured (`backend/src/ledger/ledger.routes.ts`), while vaults fall back to the
in-memory store — expect an empty ledger in a local-only setup.

## Wireable now (server side exists)

### 1. Auth — the gate

| seam | endpoint | notes |
|---|---|---|
| `src/lib/mockAuth.ts` `roleFor/readSession/writeSession/clearSession` | `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me` | `AuthResult = { user: { id, email, fullName, role, avatarUrl, createdAt }, token, sessionId, expiresIn }` |
| `src/pages/dashboard/session.tsx` (`DashSession`) | same | derive role from `/me`, not from the email prefix |
| `src/pages/auth/*` | same | demo rules (`fail@`, `MIN_PASSWORD`, `RESEND_SECONDS`) are mock-only; the server enforces `backend/src/auth/auth.schemas.ts` |

Map the server's `FREELANCER`/`CLIENT` to the app's `freelancer`/`client` (lowercase)
in one place. Store the token with `apiClient.setToken(token, remember)`; keep
`vl.dash.session` only as the demo-mode path. Effort: **S–M**.

### 2. Vaults, invites, files, manifests

| seam | endpoint | gap |
|---|---|---|
| `mockApi.listFreelancerVaults` | `GET /api/vaults` | response shape (members, status enum) needs the same mapping `fetchLiveVaults` already does |
| `mockApi.createVault` | `POST /api/vaults` | freelancer-only on the server; draft flag has no server equivalent |
| `mockApi.updateVault` | `PATCH /api/vaults/:id` | freelancer owner only |
| `mockApi.inviteClient` | `POST /api/vaults/:id/invite` | returns the invite code the drawer shows |
| `joinVault` (lib/api.ts) | `POST /api/vaults/:id/accept` | client role only |
| `mockApi.submitForReview` | — | no submit route found; state machine is `backend/src/vaults/vault.state-machine.ts` — needs a route or a `PATCH status` |
| `mockApi.deleteDraft` | — | no delete route |
| `listFiles` / `mockApi.scanArchive` | `POST /api/uploads/:vaultId` (multipart, freelancer), `GET /api/uploads/vault/:vaultId/files`, `GET /api/uploads/download/:fileId` | list route exists, no client method yet; uploads are real files (disk adapter) |
| `mockApi.manifestFor` | `GET /api/manifests/:vaultId`, `POST /api/manifests/:vaultId/verify` | the client computes a sha today; the server stores/verifies one |

Effort: **M** for the set.

### 3. PayPal capture / void

`POST /api/vaults/:id/capture` and `/:id/void` exist (and a webhook router) but no
component calls them; the authorize button only creates the order. Effort: **S**.

### 4. FastAPI m3 engine (nothing calls it)

| endpoint | purpose |
|---|---|
| `POST /projects`, `GET /projects/{id}` | project records |
| `POST /projects/{id}/parse-criteria` | criteria parsing |
| `POST /projects/{id}/approve-criteria/{client,freelancer}` | two-sided criteria approval |
| `POST/GET /projects/{id}/runs`, `GET /projects/{id}/runs/{run_id}` | verification runs |
| `POST/GET /projects/{id}/files` | attachment upload/list |
| `POST /paypal/orders`, `/orders/{id}/approve`, `GET /orders/{id}`, `POST /paypal/webhook` | an alternative PayPal surface |
| `GET /health` | liveness |

The app's vocabulary is *vaults/files/checks*; the engine's is *projects/runs*.
Wiring means either a proxy route in Express (`/api/ai/*`, keeping one origin and
the JWT) or a direct base URL plus CORS on FastAPI. The Express proxy is safer:
the engine's routers carry no auth of their own. Effort: **M**.

## Needs backend work first (mock-only today)

| frontend seam | today | needs |
|---|---|---|
| `updatePayoutProfile`, `updatePayoutPrefs`, `updateProfile`, `updateNotifications`, `changePassword`, `listSessions`, `revokeSession`, `revokeOtherSessions`, `startTwoFactor`, `confirmTwoFactor`, `disableTwoFactor`, `exportData`, `deleteAccount`, `listDeleteBlockers` | sessionStorage `vl.settings` + seeded sessions | `PATCH /api/me`, `/me/notifications`, `/me/password`, `/me/payout-profile`, `/me/payout-prefs`, `GET|DELETE /me/sessions`, `/me/2fa/*`, `PUT /me/export`, `DELETE /me` |
| `paymentsApi`: `getPayoutProfile`, `listPayouts`, `listReceipts`, `listHolds`, `retryPayout`, `downloadReceipt` | mock with fake latency; receipts are printable HTML marked "MOCK RECEIPT — NO MONEY MOVED" | payout/receipt/hold tables + PDF route; nothing on either server models these |
| `mockApi.getFreelancerKpis`, earnings aggregates | computed from the mock store | either an endpoint or client-side aggregation over `GET /api/vaults` (cheapest) |

Effort: **L** for settings, **L** for the payments page, **S** for KPIs via aggregation.

## Sequence

1. **Auth** — `mockAuth` → `/api/auth`, token into `apiClient`, `/me` on boot. Nothing else works before this.
2. **Vaults + invites** — replace `mockApi`'s vault store; the same mapping already written in `data.tsx`.
3. **Files + manifests** — two read calls plus the existing upload route.
4. **PayPal capture/void** — completes the client flow the authorize button starts.
5. **FastAPI via Express proxy** — criteria parsing and verification runs.
6. **Settings and payments routes** — write the server side, then change only the seam bodies; the components do not move.

## Hazards

- `requireAuth` on everything: a missing `vl_token` shows as an empty dashboard, not an error, because `fetchLiveVaults` returns `[]` on `!success`.
- Two API bases (`VITE_API_URL` vs hardcoded `localhost:3000`) and two token readers; consolidate on `apiClient`.
- Role casing (`FREELANCER` vs `freelancer`) and the demo email rule must not both decide a role.
- `isDemoMode()` (`?demo=1`, `VITE_DEMO_MODE`, `vl_demo_mode`) is the existing switch for keeping mocks — wire behind it rather than deleting the mocks.
- Unmerged branch: `origin/feat/m1-step2` has one commit beyond `main` (`abb6a34 enhanced ai`, adds `backend/src/ai/ai.service.ts`, trims `vault.actions.ts`) — the AI endpoints above may change shape when it lands.
