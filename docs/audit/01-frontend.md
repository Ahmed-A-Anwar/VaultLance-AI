# 01 — Frontend audit

Stack: React 19 + Vite 6 + react-router 7, Tailwind 4, AG Grid for the two ledgers.
Evidence is `src/App.tsx` (route table), `src/pages/dashboard/routeTable.tsx`, `src/config/fx.ts`, `src/lib/*`, and the component files named per row.

## 1. Route and screen inventory

| Route | Role | Status | Data source | Component | What works | What is missing | Evidence |
|---|---|---|---|---|---|---|---|
| `/` | public | DONE | static + clips | `src/pages/Landing.tsx`, `components/Hero*.tsx` | Full pitch page, CTA overlay (solo / with a friend / sandbox), wheel + keypad clips | 21 MB of frame assets ship on first paint path (lazy-ish but same origin) | `src/App.tsx:78`, `public/wheel-turn` 81 files 4 MB, `keypad-frames` 96 files 5 MB |
| `/signup` | public | PARTIAL | real `POST /auth/register` | `src/pages/Signup.tsx` | Real account creation, validation, stepper | Demo mode accepts any address and invents a session (`mockAuth.ts:198-211`); reachable with `?demo=1` on the deployed build | `src/lib/mockAuth.ts:198`, `apiClient.ts:34-43` |
| `/signin` | public | PARTIAL | real `POST /auth/login` | `src/pages/Signin.tsx` | Real login, role from server profile, keypad clip handoff | "Forgot password?" still has `href="#"` in one branch | `Signin.tsx:324` |
| `/forgot-password` | public | PARTIAL | real reset request | `src/pages/auth/ForgotPassword.tsx` | Request, resend cooldown, dev link shown only in DEV | Email delivery is UNVERIFIED (no SMTP/provider evidence in the API) | `ForgotPassword.tsx:69-70,394`; `backend/src/auth/passwordReset.service.ts` not exercised |
| `/reset-password` | public | DONE | real inspect + confirm | `src/pages/auth/ResetPassword.tsx` | Token states valid/expired/invalid, strength meter, 5 bolts | — | `src/lib/mockAuth.ts:120-175` |
| `/vault/new` | freelancer | PARTIAL | real create + real upload | `src/pages/VaultNew.tsx` | Create vault, pick files, review | Staging-URL check is mocked ("Responded in … ms (MOCK)"); fee lines are EST | `components/freelancer/NewVaultDrawer.tsx:542,578-579` |
| `/vault/:id` | both members | PARTIAL | real vault, checks, chat, approve, download | `pages/vault/AuditRoom.tsx`, `components/vault/*` | Real state, real approve→capture, real signed download, chat grounded in files | Checks are file-metadata templates, not the AI engine; chat counter hardcoded 0/15 | `backend/src/vaults/vault.actions.ts:574,587-643` |
| `/playground` | public | MISSING | — | `App.tsx:33-43` | Redirects `?vault=` to `/vault/:id`; otherwise a "moved" page | No standalone judge path | `src/App.tsx:36` |
| `/v/:token`, `/v/:token/files` | public link | MOCK | local store | `pages/ClientPortal.tsx`, `ClientFiles.tsx` | Legacy portal/films | Not wired to a server token; parallel to `/vault/:id` | `src/App.tsx:88-89` |
| `/console` | public | MOCK | local store | `pages/Console.tsx` | Ledger console demo | No server scope | `src/App.tsx:90` |
| `/demo` | public | MOCK | local store | `pages/Demo.tsx` | Deterministic demo | — | `src/App.tsx:91` |
| `/dashboard` (client) | client | DONE | real vaults + KPIs | `pages/dashboard/Overview.tsx`, `components/dashboard/data.tsx` | Live vault cards, KPIs, polling, error state instead of mock rows | Vault card PayPal id is fabricated (`8XK` + first 8 chars of the vault id) | `data.tsx:71` |
| `/dashboard/vaults` | client | DONE | real | `pages/dashboard/VaultsPage.tsx` | Filters, join row | Join-by-code is demo-only (see below) | `components/dashboard/JoinRow.tsx:61`, `lib/api.ts:419-460` |
| `/dashboard/ledger` | client | DONE | real `GET /ledger` | `LedgerPage.tsx`, `LedgerCard.tsx`, `LedgerGrid.tsx` | Scoped ledger, five mapped event types, duplicates fixed in `27aff03` | Rows with other types are dropped | `data.tsx:76-84` |
| `/dashboard/payments` | both | PARTIAL | local `paymentsApi` + real payout retry | `pages/dashboard/payments/PaymentsPage.tsx`, `components/payments/*` | Holds, receipts, fee math, payout history, retry | Reads are mock/latency-simulated; "MOCK" chips on two cards | `components/payments/paymentsApi.ts:1-12,65-71`; `ClientPayments.tsx:290,390` |
| `/dashboard/settings` | both | PARTIAL | mixed | `pages/dashboard/settings/*` | Profile, password, export, delete with blockers | Sessions, MFA (visual MOCK QR), notification prefs, payout email are local/mock | `settings/SecurityCard.tsx:475`; `lib/api.ts:1322-1380` |
| `/dashboard` (freelancer) | freelancer | DONE | real vaults/events/KPIs | `pages/dashboard/freelancer/FreelancerDashboard.tsx`, `components/freelancer/liveApi.ts` | Vaults, earnings ledger, payout banner, retry | Remind/duplicate/delete-draft have no routes | `docs/phase2-map.md:184-193` |
| `/dashboard/vaults` (freelancer) | freelancer | DONE | real | same | Invite copy, submit, details drawer | Staging URL, remind, duplicate, delete draft are mock | `components/freelancer/mockApi.ts:469`; `NewVaultDrawer.tsx:542` |
| `/dashboard/ledger` (freelancer) | freelancer | DONE | real ledger | `EarningsGrid.tsx`, `liveApi.ts` | Real event mapping (fixed in `e7897cd`) | Same drop rule for unmapped rows | `freelancer/liveApi.ts:39-48` |
| `/dashboard/payments` (freelancer) | freelancer | PARTIAL | mock reads, real retry | `FreelancerPayments.tsx` | Payout view, retry | Payout status read is not exposed by the API (gap B5) | `components/payments/paymentsApi.ts:102-103` |
| `*` | public | DONE | — | `App.tsx:100` | 404 copy with a link home | — | `src/App.tsx:98-100` |

Dead links: exactly one literal `href="#"` remains (`Signin.tsx:324`). Every other navigation is a router link or a button handler (`grep -rn 'href="#"' src` → 1 hit).

## 2. Data layer and flags

- `src/config/fx.ts:73-96` — `FX_REAL_DEFAULTS` sets **all nine** groups to `true` (`auth`, `vaultsRead`, `vaultsWrite`, `uploads`, `audit`, `settings`, `payments`, `events`, `payouts`). `realOverride` is empty. `FX_REAL_API` reads `VITE_USE_REAL_API`, so the build is real-API by default.
- Effect flags: `wheelClip`, `keypadClip`, `signinFlow`, `forgotFlow`, `settingsPage`, `freelancerDashboard`, `paymentsPage` all `true`; `mockErrors` is `false` (`fx.ts:16-45`).
- `mockErrors` gates every random 5 % failure (`api.ts:1130`, `freelancer/mockApi.ts:311`, `payments/paymentsApi.ts:71`, `settings/freelancerSettingsApi.ts:33`, both reset pages). With the shipped literal `false`, none can fire. The "forced false in production" comment is documentation, not code; the literal is the reason it is off.
- Reads: `src/lib/reads.ts` → `fetchVaults` when `vaultsRead` is on, ledger through `data.tsx:90-140` with an explicit `LEDGER_TYPE` map; failures surface `ApiError` and an error state (`data.tsx` error field), never demo rows.
- Freelancer reads: `components/freelancer/liveApi.ts` — real vaults, events, KPIs; file counts per vault via `apiClient.uploads.list` (N+1 requests, one per vault: `liveApi.ts:52-60`).
- Payments reads: `components/payments/paymentsApi.ts:60-160` — local store + 300–618 ms simulated latency, with the real retry call `retryPayoutOnServer` imported at `paymentsApi.ts:21`.
- Adapters: `src/lib/adapters/*` (vault, event, file, money, statusMap) are pure and unit-tested (11 + 5 + 5 + 4 tests). `eventAdapter.ts:3-4` still says it is blocked by the old unscoped ledger; that comment is stale now that `GET /api/ledger` is scoped (`backend/src/ledger/ledger.routes.ts:15-38`).
- Status map: 14 Express states → 5 UI states; unknown states render as `voided` with one warning (`statusMap.ts:60-71`).

## 3. Storage and tokens

| Key | Store | Contents | Risk |
|---|---|---|---|
| `vl_token` | `sessionStorage` only | bearer JWT | Correct: no localStorage, no URL, no cookie (`src/lib/http.ts:57-90`) |
| `vl.dash.session` | **both** `sessionStorage` and `localStorage` | email, role, `since`, optional display name — never the token | Low–medium: the email/role persist after the tab closes. `mockAuth.ts:108-112` |
| `vl_demo_mode` | `localStorage` | `"true"`/`"false"` | Demo switch; survives reload |
| settings keys (`SETTINGS_KEY`, `BOOT_KEY`, `STORAGE_KEY`) | local | UI prefs / mock settings | Low |

No `document.cookie` use anywhere (`grep` → no hits). `fetch` uses `credentials: "omit"` (`http.ts:150`), so the bearer token is the only credential.

## 4. Security (frontend)

- `dangerouslySetInnerHTML`: one use, `components/QrPanel.tsx:22`, rendering SVG produced locally by the `qrcode` library from a fixed string. No user or AI text goes through it.
- AI/chat text: rendered as text; the API strips markers and caps length (`vault.actions.ts:648-812`). No `eval`, no `innerHTML` for model output.
- Build-time secrets: only `VITE_*` public values (`apiClient.ts:10`, `PayPalAuthorizeButton`), which Vite inlines by design. No service key in `src` (`grep` for `service_role` → none).
- Tokens in URLs: none; the reset token is a route query param (`/reset-password?token=`), which is expected for a reset link but will appear in history/referrer.
- Mixed content: `API_BASE_URL` is https in production; a production build with no `VITE_API_URL` calls same-origin `/api`.
- Security headers on the SPA: **absent**. `curl -D` on the deployed page returned only Vercel's `Strict-Transport-Security` and `X-Vercel-*`; no CSP, no `X-Content-Type-Options`, no `X-Frame-Options`, no `Referrer-Policy`. `vercel.json` sets only cache headers and the SPA rewrite. The API's `helmet()` CSP (`backend/src/app.ts:28`) covers JSON responses, not the page.
- Dev panel: `components/dashboard/DevPanel.tsx:10-13,26` returns `null` and installs no listener unless `import.meta.env.DEV`, so Shift+D does nothing in a production bundle.
- Demo backdoor: `?demo=1` or `localStorage.vl_demo_mode` forces `isDemoMode()` (`apiClient.ts:34-43`), and `signIn` accepts any address in that mode (`mockAuth.ts:198-211`). On the deployed site this cannot move money (the API calls still 401 without a token) but it does present a signed-in shell with fabricated vaults, which is a judgement risk in front of a judge.

## 5. Quality: design system, motion, accessibility, bundle

- Tokens: all colours live in `src/styles/tokens.css` per `docs/PLAN.md:7-31`; contrast pairs are documented there and enforced by tests (`tests/responsive.spec.ts`, `tests/reduced-motion.spec.ts`).
- Reduced motion: `tests/reduced-motion.spec.ts` exists and is part of the Playwright suite; motion code reads the media query (see `src/lib/clipPlayer.ts`).
- Keyboard/aria: skip link in the app shell (`src/App.tsx:66`), focus trap in `components/freelancer/focusTrap.ts`, `aria-live` on `AmountReadout.tsx`, labelled grids. No automated axe pass exists.
- Mobile: 390 px layouts covered by `tests/responsive.spec.ts`; the audit did not re-render them in a browser.
- Clips: `public/wheel-turn` 81 frames (4 MB), `public/keypad-frames` 96 (5 MB), `public/vault-frames` 121 (9 MB), `public/vault-frames-sm` 120 (4 MB). `scripts/gen-clip-manifest.mjs` runs on `predev`/`prebuild`. Fallback when frames fail: `clipPlayer.ts` keeps the static poster and the DOM overlays (per its comments) — not re-verified in a browser.
- Bundle: `dist` 24 MB. The largest JS is `assets/index.esm-*.js` (PayPal SDK) and `assets/index-*.js`; AG Grid and the freelancer dashboard are route-split (`DashboardLayout-*.js`, `FreelancerDashboard-*.js`). The 21 MB of `public/` assets are copied verbatim and fetched on demand, not inlined.
- Tests present: 11 vitest files / 65 tests (all pass), 17 Playwright specs / 142 tests (result in `03-live.md` §6).

## 6. Honesty: labels vs reality

| Surface | Label | Reality | Verdict |
|---|---|---|---|
| Freelancer NewVault staging URL | `(MOCK)` | local simulation | Correctly labelled |
| Fee lines | `PAYPAL FEE (EST.)`, `YOU RECEIVE (EST.)` | arithmetic on the client, real fees come from the capture | Correctly labelled |
| Client Payments two cards | `MOCK` chips | local mock data | Correctly labelled |
| Security card 2FA | `MOCK` under the QR | no MFA server route | Correctly labelled |
| Freelancer details drawer | no label | remind/duplicate/delete-draft are mock | **Unlabelled mock** — dangerous |
| Vault card PayPal id | none | `8XK` + vault-id prefix, fabricated (`data.tsx:71`) | **Unlabelled fake data** |
| Dashboard ledger | none | real rows | Now real (was duplicated before `27aff03`) |
| Freelancer earnings | none | real rows | Now real (before `e7897cd`) |
| Join row | none | works only in demo; non-demo shows an honest error | Acceptable but the "Try the demo project" button sits next to a real form |
| Chat "DEMO CACHE" chip | only if `cached: true` | server always sends `cached: false` | Correct |

## 7. What the frontend cannot do today

- Redeem a real invite code (the server route exists; no client call).
- Read payout status from the get-go (no `GET /:id/payout`).
- Waive a failed check or send work back for revision from the audit room (no route; `NEEDS_REVISION` exists in the state machine only).
- Show a real receipt with the PayPal capture id outside the audit room (vault read was patched to include ids, but the payments card still reads the local model).
- Show live updates other than polling (`data.tsx` poll loop, `shouldPoll` in `reads.ts`); there is no SSE/websocket.
