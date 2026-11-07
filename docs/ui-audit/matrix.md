# UI matrix

Generated 2026-11-07. Source of truth for the sweep: `scripts/ui-sweep.mjs`.
Every cell is driven in demo mode (`?demo=1`) with a seeded `vl.dash.session`;
API reads are answered by local route stubs, so no real row is created or read.

## Routes and roles

| Route | Role | Screens |
|---|---|---|
| `/` | public | landing (hero, proof, payoff CTA) |
| `/signup` | public | role picker → freelancer form → success card |
| `/signin` | public | sign-in card, error state |
| `/forgot-password` | public | request form, sent state, error |
| `/reset-password` | public | no token / invalid / expired / valid / done |
| `/playground` | public | playground entry |
| `/playground/return` | public | PayPal return |
| `/demo` | public | demo launcher |
| `/console` | public | console |
| `/vault/new` | public | new-vault page |
| `/v/:token` | public | client portal, locked/unlocked |
| `/v/:token/files` | public | client files |
| `/vault/:id` | both | audit room: awaiting payment, held, auditing, failed check, awaiting approval, PAID, voided |
| `/dashboard` | client / freelancer | overview |
| `/dashboard/vaults` | client / freelancer | vault list, empty, many rows, filter, row popover |
| `/dashboard/ledger` | client / freelancer | ledger / earnings, empty, 1,000 events |
| `/dashboard/payments` | client / freelancer | holds + receipts, payout states |
| `/dashboard/settings` | client / freelancer | profile, security, payouts, notifications, danger zone, modal |
| `/dashboard/*` (unknown) | both | in-shell 404 |
| any other path | public | global 404 |

`/terms` and `/privacy` are **not routes in this app**; the 404 cell covers the
unknown-path state rather than inventing a page.

## Overlays and transient states

| Component | States |
|---|---|
| New-vault drawer | details, deliverables (scan pass/fail), review, success, invite code, error |
| Details drawer | open, long values, narrow |
| Join row | closed, open, invalid code, success |
| Modals | delete account, blockers, confirm |
| Popovers | row actions, vault filter, notifications |
| Toasts | success, info, error, retry action |
| Tooltips | hover, focus |
| Menus | role menu, rail expand |
| Loading | skeleton, spinner, slow (>2s) |
| Errors | inline field, banner, 404, network failure |

## Data stress cells (stubbed)

| Dimension | Values |
|---|---|
| Project name | 60 chars with spaces, 80 chars unbroken, emoji, CJK, Arabic (RTL), combining marks |
| Email | 254 chars |
| Amounts | $0.00, $5.00, $9,999,999.99 |
| Vault counts | 0, 1, 60 |
| Ledger | 1,000 events |
| Files | 200-char names, 500 files |
| Text | long hints, long error messages |
| Media | failed image |
| Timing | slow load (2s delay) |

## Environment cells

| Dimension | Values |
|---|---|
| Viewports | 390×844, 768×1024, 1024×768, 1280×720, 1440×900, 1920×1080 |
| Engines | chromium, webkit; **firefox blocked** (binary not installed, install not approved) |
| Zoom | 200% at 1280; 400% (320 CSS px reflow) |
| Text | 200% text-only |
| Preferences | reduced motion, forced colors, dark scheme |
| Output | print preview of receipts |

## Fix scope

P0 first (unusable, hidden/overlapped content, horizontal scroll), then P1
(clipped text, primary action under 44px on mobile, covered overlay), then P2.
P3 only when cheap. Every shared-component change re-runs its routes.
