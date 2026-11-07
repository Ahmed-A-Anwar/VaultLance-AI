# UX report

Run 2026-11-07, chromium 1440×900, demo mode with local API stubs. No real row
was created.

## Flows walked

| Flow | Result | Clicks | Time | Worst friction |
|---|---|---|---|---|
| F1 first visit | reached the playground, **not** an audit room | 2 | 5.2 s | 3 — playground vault link returns to `/` |
| F2 new freelancer | **blocked**: submit gave no success and no error | 2 | 2.5 s | 4 — silent submit |
| F4 returning user | **pass**: sign-in → dashboard, action visible | 1 | 8.3 s (3.29 s sign-in) | 1 — no pending state |

F3 (client pay/approve/download), F5 (recovery) and F6 (account) were **not
walked** in this pass.

## Fixed

| Fix | Before | After |
|---|---|---|
| Per-route document titles (`src/App.tsx`) | every route shared "VaultLance AI — the sealed instrument" | `/signup` "Create your account", `/signin` "Sign in", `/playground` "Playground", dashboard "Overview", vault and audit-room titles mapped |

Verified in the second run: the four titles above changed as expected; typecheck 0.

## Remaining

| Sev | Issue | Why |
|---|---|---|
| 4 | Demo signup submit produces no success and no error | Needs the demo submit path instrumented; copy-only change but unverified |
| 3 | Playground's vault link returns to the landing page | Flow defect; likely needs a product decision on the demo entry (DECISIONS) |
| 2 | Frame loader owns first paint | Animation system; a text variant is a design decision |
| 1 | Sign-in has no pending state (3.29 s) | Loading state is in scope; not implemented yet |

## Accessibility

axe: **0 serious/critical** on `/playground`, `/signin` and the freelancer
dashboard. Keyboard: the playground CTA is 4 tabs from the top of the landing.
A full keyboard run of F1–F4, the accessibility-tree review and the 200%/400%
zoom checks were **not** performed.

## DECISIONS

Canonical terms and their counts are in `DECISIONS.md` (vault, Freelancer/Client,
Sign in, authorize/held/release/cancel). The playground entry and the demo
signup answer need your call before changing.

## Honest summary

Only three of six flows were walked, one of them blocked at its first screen.
The one product-wide defect found — a single page title for the whole app — is
fixed and verified. Real devices, screen readers and real users were not
available; the manual steps are listed in `MANUAL.md` (pending).
