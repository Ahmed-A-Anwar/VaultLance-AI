# 04 — End-to-end flow trace (static, UI click → database row)

Each hop is marked DONE / PARTIAL / MOCK / BROKEN / MISSING. "Mock" means a fake in the path.
Route references are backend unless prefixed `src/`.

## Flow 1 — Sign up, verify, sign in, sign out, reset

| Hop | Verdict | Evidence |
|---|---|---|
| Sign-up form → `POST /api/auth/register` | DONE | `src/pages/Signup.tsx` → `src/lib/authApi.ts` → `apiClient.auth.register` (`src/lib/apiClient.ts:150`) |
| Server creates the account | PARTIAL | `auth.service.ts:register` creates a Supabase Auth user with `email_confirm: true`, inserts `public.users`, bcrypt-hashes (12 rounds). No verification email is sent, so the "verify" step does not exist |
| Token issued and stored | DONE | JWT + session row; `http.ts:57-90` keeps it in `sessionStorage` only |
| Sign in | DONE | `auth.service.ts:login` (bcrypt compare or Supabase fallback), role from the profile |
| Sign out | DONE | `src/components/dashboard/session.tsx:30` calls `authApi.logout()` (which posts `/auth/logout` and clears storage), then `clearSession()` empties the tab's keys (`mockAuth.ts:114-120`) |
| Forgot password | PARTIAL | `POST /auth/password-reset/request` answers identically for every address; delivery provider absent from the code |
| Reset with token | DONE | inspect + confirm routes, `passwordReset.service.ts`; UI handles valid/expired/invalid |

## Flow 2 — Freelancer creates a vault, uploads a ZIP, submits, invites

| Hop | Verdict | Evidence |
|---|---|---|
| Drawer → create vault | DONE | `src/components/freelancer/NewVaultDrawer.tsx` → `lib/vaultWrites.ts` → `POST /api/vaults` (`vault.routes.ts:19`) |
| Upload files | DONE | `POST /api/uploads/:vaultId` → multer limits → `ZipSecurityValidator` → private bucket (`uploads/upload.routes.ts:14`, `upload.service.ts:40-101`) |
| Staging URL check | MOCK | simulated prober, labelled `(MOCK)` (`NewVaultDrawer.tsx:542`) |
| Submit / lock manifest | DONE | `POST /:id/submit` → canonical JSON + SHA-256 (`manifests/manifest.service.ts`) |
| Invite by email | DONE | `POST /:id/invite` (`vault.routes.ts:41`) |
| Invite by code | PARTIAL | server mints `VL-XXXX-XXXX` (`invite.routes.ts:22`); the UI copy button and the client join do not call it |
| Remind / duplicate / delete draft | MISSING | no routes; drawer actions are mock (`mockApi.ts:469`) |

## Flow 3 — Client joins with a code, pays, approves, returns to AUTHORIZED

| Hop | Verdict | Evidence |
|---|---|---|
| Join by code | MOCK | UI `joinVault` refuses outside demo mode with "Joining by code isn't available yet" (`src/lib/api.ts:419-434`); server has `POST /:id/join` but nothing calls it |
| Join by email invite | PARTIAL | `POST /:id/accept` exists and is unused by the UI; membership is added by the invite flow |
| Create PayPal order | DONE | `POST /:id/payment/order` → PayPal `intent=AUTHORIZE`, `PayPal-Request-Id: order-<vaultId>`, amount from DB, order id remembered |
| Buyer approves in PayPal | PARTIAL | PayPal JS SDK popup on the audit room (`src/components/vault/PayPalAuthorizeButton.tsx`); requires a sandbox **personal** account, so it cannot be automated |
| Claim the approval server-side | DONE | `POST /:id/payment/reconcile` → `claimApprovedOrder` → PayPal authorize → status `AUTHORIZED` + `FUNDS_AUTHORIZED`; also heals `ORDER_ALREADY_AUTHORIZED` on the order route |
| Return page | PARTIAL | `src/lib/paypalReturn.ts` + `room.tsx` reconcile-on-open; the server no longer depends on it |
| Webhook alone | PARTIAL | `PAYMENT.AUTHORIZATION.CREATED` only stores the authorization id (`webhook.service.ts:53-61`) — no status flip, no ledger row |

## Flow 4 — Audit: checks, chat, report, limits

| Hop | Verdict | Evidence |
|---|---|---|
| Run checks | PARTIAL | `POST /:id/checks/run` generates checks from file name/type/size/hash (`vault.actions.ts:587-643`) — real data, heuristic rules, not model output |
| State moves to AWAITING_APPROVAL | DONE | `SUBMITTED → VERIFYING → AWAITING_APPROVAL` in three writes, ledger `AUDIT_COMPLETED` |
| Chat answers | MOCK (AI sense) | deterministic templates grounded in the file index; `sources` are real file categories; `cached: false` always (`vault.actions.ts:648-812`) |
| Question limit | BROKEN (claim) | `questionsUsed: 0`, `questionLimit: 15` hardcoded (`vault.actions.ts:574`); never persisted or enforced |
| AI engine | MISSING | not deployed (`03-live.md` §2); the API never calls it outside the diagnostic route |

## Flow 5 — Approve, capture, webhook or sweeper, PAID, unlock, download

| Hop | Verdict | Evidence |
|---|---|---|
| Approve button | DONE | `DecisionPanel` → `POST /:id/approve` → `approveVault` |
| Client-only + state guard | DONE | `assertClientMember`, status must be `AWAITING_APPROVAL` (`money/approve.service.ts:20-41`) |
| Capture exactly once | DONE | compare-and-set to `CAPTURE_PENDING`, `PayPal-Request-Id: capture-<authorizationId>` (`money/approve.service.ts:52-63`) |
| Record capture, fees, unlock | DONE | `confirmCapture` writes `vault_captures`, unlocks files, ledger (`money/capture.service.ts`) |
| Webhook path | DONE | `PAYMENT.CAPTURE.COMPLETED` → `confirmCapture` (idempotent, checks the capture id) |
| Stuck capture | DONE | sweeper every 60 s (`money/sweeper.ts:40-44`) |
| Files locked until PAID | DONE | download route 403 unless `vault.status === "PAID"` (`vaults/download.routes.ts:27-30`) |
| Download | DONE | 60-second signed URL, member-only, no storage path in the body |
| Live proof after the latest change | UNVERIFIED | unit-tested; no capture was performed against the deployed API in this audit (read-only mandate) |

## Flow 6 — Payout created once, paid or failed, retry

| Hop | Verdict | Evidence |
|---|---|---|
| Create payout after capture | DONE | `ensurePayout` called by `confirmCapture`; unique row per vault; deterministic `sender_batch_id` per attempt |
| Receiver | PARTIAL | the freelancer's **login email** (`money/access.ts:freelancerEmail`); no payout-address field exists |
| Success webhook | DONE | `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` → status `paid` + ledger |
| Failure webhook | DONE | `FAILED/BLOCKED/RETURNED` → status `failed` + reason + ledger |
| Surface the failure | MISSING | no `GET /:id/payout`; the client cannot read `status/reason/attempt` |
| Retry | DONE | `POST /:id/payout/retry`, freelancer-only, only from `failed`, new batch id (`money/payout.routes.ts:20-46`) |

## Flow 7 — Reject, void, files stay locked

| Hop | Verdict | Evidence |
|---|---|---|
| Reject | PARTIAL | `POST /:id/reject` sets `CANCELLED` and writes `VAULT_CANCELLED` (`vault.actions.ts:305-343`) |
| Void the PayPal hold on reject | **MISSING** | the reject route never calls `voidAuthorization`; only `POST /:id/void` does (`paypal.routes.ts:474-545`). A rejected vault leaves the buyer's authorization held at PayPal until it expires |
| Files stay locked | DONE | download requires `PAID`; a cancelled vault never reaches it |
| Void endpoint | DONE | `POST /:id/void` voids at PayPal when an id is known, sets `CANCELLED`, ledger `VAULT_CANCELLED` |

## Flow 8 — Failed check: waiver or revision

| Hop | Verdict | Evidence |
|---|---|---|
| Mark a check failed | DONE | check results are computed server-side and returned |
| Waive a failure | MISSING | no route, no field |
| Send back for revision | MISSING | `NEEDS_REVISION` exists in `vault.state-machine.ts:13` but nothing transitions into it |
| Approve despite failures | PARTIAL | `src/lib/api.ts:approveVault(id, overrideFailures)` has an override parameter; the server's `approveVault` ignores it (`money/approve.service.ts`), so the UI's "override" is cosmetic |

## Flow 9 — Account deletion with money in motion

| Hop | Verdict | Evidence |
|---|---|---|
| Block when money moves | DONE | statuses `AUTHORIZED…CAPTURE_PENDING` and open payouts block (`auth.service.ts:deleteAccount`) |
| Structured blocker list | MISSING | the 409 message is prose; no `details.blockers[]` |
| Delete | DONE | memberships → profile → auth user, ledger actor nulled; tolerates an already-deleted auth user |
| Live verification | UNVERIFIED | not executed (destructive, and the mandate is read-only) |

## Flow 10 — Settings changes

| Change | Verdict | Evidence |
|---|---|---|
| Full name | DONE | `PATCH /auth/me` → Supabase profile + auth metadata |
| Password | DONE | verifies the current password against Supabase Auth, updates both stores, revokes other sessions |
| Export | DONE | `GET /auth/me/export` returns account, vaults, memberships, files, ledger |
| Payout email | MOCK | stored locally (`src/lib/api.ts:1195-1207`); no server column or route |
| Sessions list / revoke | MOCK | `src/lib/api.ts:1322-1355` local |
| Two-factor | MOCK | `SecurityCard.tsx` QR sheet labelled MOCK; no server routes |
| Notifications | MOCK | `src/lib/api.ts:1031,1284` |

## Manual checks needed to finish the proof

1. Create a vault as `freebufffreelancer@…`, get an invite code, join as `freebuffclient@…` using the **server** route (`POST /api/vaults/:id/join`) — proves the join path before the UI is wired.
2. Approve the $23 vault in a sandbox personal account, then confirm `AUTHORIZED` + `FUNDS_AUTHORIZED` without opening the room (tests the webhook claim, which currently does not exist).
3. Approve → capture → payout in one run; read `vault_captures` and `vault_payouts` rows.
4. Reject a funded vault, then check the authorization at PayPal is voided (today it will still be held).
5. Download a file before and after `PAID`, confirming 403 then a signed URL.
