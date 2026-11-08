# UX report

Run 2026-11-07, chromium 1440×900, demo mode with local API stubs. No real row
was created.

## Flows walked

| Flow | Result | Clicks | Time | Worst friction |
|---|---|---|---|---|
| F1 first visit | reached the playground, **not** an audit room | 2 | 5.2 s | 3 — playground vault link returns to `/` |
| F2 new freelancer | **pass**: signup card in 1.01 s, dashboard, drawer in 109 ms | 4 | 26.2 s | 1 — success card routes to dashboard before the first vault |
| F3 client | **pass**: join, interrogate, approve, download | 1 | 7.8 s | 0 — download fixed; header state open (2) |
| F4 returning user | **pass**: sign-in → dashboard, action visible | 1 | 8.3 s (3.29 s sign-in) | 1 — no pending state |
| F5 recovery | **pass**: 7 error states, each with a working way out | — | — | 1 — 429 prints the API's own sentence |
| F6 account | **pass**: profile, password, sessions, delete blockers, sign out | 4 | — | 0 |

All six flows were walked.

## Fixed

| Fix | Before | After |
|---|---|---|
| Per-route document titles (`src/App.tsx`) | every route shared "VaultLance AI — the sealed instrument" | `/signup` "Create your account", `/signin` "Sign in", `/playground` "Playground", dashboard "Overview", vault and audit-room titles mapped |
| Portal row download (`src/components/ManifestRow.tsx`) | button fired no download while the page promised one | downloads a text stub named after the file, carrying path, size and sha256 |
| Focus after signup (`src/pages/Signup.tsx`) | success card appeared with focus on `<body>` | focus moves to the success heading |
| Focus after route change (`src/App.tsx`) | every navigation dropped focus to `<body>` | focus moves to the new page's `<main>` |

Verified in the second run: the four titles above changed as expected; typecheck 0.

## Remaining

| Sev | Issue | Why |
|---|---|---|
| 3 | Playground's vault link returns to the landing page | Flow defect; likely needs a product decision on the demo entry (DECISIONS) |
| 2 | Frame loader owns first paint | Animation system; a text variant is a design decision |
| 2 | Client portal header always states HELD/read-only, even on a captured vault | Money-state display; needs a decision |
| 1 | Sign-in has no pending state (3.29 s) | Loading state is in scope; not implemented yet |

## Accessibility

axe: **0 serious/critical** on `/playground`, `/signin`, the freelancer dashboard,
the client portal and the files page.

**Keyboard-only F1–F4 walked** (`evidence/keyboard.json`). Fixes: signup success
now focuses its heading (was `<body>`), and a route change now moves focus to the
new page's `<main>` (was `<body>`, seen after approving). The drawer opens onto
its Close control and Escape returns focus to the trigger. Still open: on the
landing, Tab can reach the header's Sign up/Sign in before the intro reveal has
faded them in (sev 2), and no skip-link / tab-order break was found below that.
The accessibility-tree review, 200%/400% zoom and forced-colors checks were
**not** performed.

## DECISIONS

Canonical terms and their counts are in `DECISIONS.md` (vault, Freelancer/Client,
Sign in, authorize/held/release/cancel). The playground entry and the demo
signup answer need your call before changing.

## Honest summary

All six flows were walked. Product defects found and fixed: one page title for
the whole app, an inert manifest download, focus lost after signup and after
routing. Two "failures" reported during the pass were probe defects, not product
ones (the F2 silent submit and the F6 sign-out resurrection). Real devices,
screen readers and real users were not available; `MANUAL.md` is still to be
written, as is `strings.md`, and 200%/400% zoom was not checked.
