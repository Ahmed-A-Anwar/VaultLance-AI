# Laws audit — report

Date: 2026-11-09  
Branch: `chore/laws`  
Scope: top screens, no new features, no money/state/auth/security-rule changes.

## Status vocabulary

- **PASS** — source and/or browser evidence supports the law on the reviewed screen.
- **CHANGED** — a concrete change was made and checked in this branch.
- **WARN** — present but not fully verified, or only at one width.
- **BLOCKED** — an external or unresolved condition prevents closing it.
- **N/A** — the law does not apply to that surface.

## The 19 laws

| Law | Status | Evidence in this pass |
|---|---|---|
| Aesthetic-Usability | PASS | One coherent instrument vocabulary; Lighthouse accessibility 100 on both presets; CLS ≤ 0.001 |
| Doherty | **CHANGED** | Hero copy paints immediately; font gate capped at 1.5 s; local mobile LCP 4.4 s (still over budget), desktop 1.0 s |
| Fitts | **CHANGED** | 44px phone targets and one primary action in the room; shared tap manipulation; prior room/refine CSS committed |
| Hick | PASS | Site nav exposes two public routes; room states expose one primary decision; secondary actions sit behind More |
| Jakob | **CHANGED** | Conventional site nav/wordmark; mock security controls removed from production; demo routes fall through to 404 |
| Miller | PASS | Dashboard rail is five areas; settings keeps a short section list; no new choices added |
| Occam | **CHANGED** | Duplicate run action removed from the held room; one primary per state; mock surfaces hidden instead of explained |
| Pareto | **CHANGED** | Work prioritized landing/auth/playground/room/overview/payments; settings/ledger left secondary |
| Parkinson | PASS | Phase stepper and check progress make the work's shape visible; no artificial countdown was added |
| Peak-End | PASS | Completion toasts and a clear paid/unlocked terminal state; not re-driven end-to-end in this pass |
| Serial Position | PASS | Primary decision is first in the room's decision panel; destructive/utility actions are last and quiet |
| Tesler | PASS | Password requirements and inline errors absorb the unavoidable complexity; no hidden validation added |
| Von Restorff | PASS | One brass primary action per state; secondary controls stay quiet |
| Zeigarnik | PASS | Audit phase/check progress and playground step rail keep unfinished work visible |
| Proximity | PASS | Decision sits with the amount; tablet order puts it above checks; evidence stays together |
| Common Region | PASS | Cards/panels own their controls; signup stepper sits inside the card it describes |
| Similarity | PASS | Shared button, chip, field, and focus treatments across public and dashboard surfaces |
| Continuity | PASS | The vault persists between public routes; the dashboard rail persists between areas |
| Prägnanz | PASS | One clear state per screen; the room's one-primary rule is the strongest example |

## Screen matrix

| Screen | Result | Notes |
|---|---|---|
| Landing | **CHANGED / WARN** | LCP text no longer hidden; desktop 97, mobile 71; mobile LCP 4.4 s remains over budget |
| Sign up | PASS | Existing target/label work; no new copy or validation change |
| Sign in | PASS | Existing target/label work; no new auth behavior |
| Playground | PASS | Step rail and next-step primary action already in the prior commit |
| Audit room | PASS / WARN | One primary per state, 44px phone targets, decision above checks on tablet; not re-driven in all five states in this pass |
| Client overview | PASS | Shared dashboard shell; no new state or money change |
| Freelancer overview | PASS | Shared dashboard shell; no new state or money change |
| New-vault drawer | PASS | Existing form; no new submission or money path |
| Payments | PASS | Existing holds/receipts; mock-only security surfaces are not on this route |
| Receipt | PASS | Generated document; no format change |
| Settings | **CHANGED** | Production shows only the real password block; mock 2FA and device list are hidden |
| Demo/legacy routes | **CHANGED** | `/demo`, `/console`, `/v/:token`, `/v/:token/files` are 404 in production |

## Copy changes

Only one visible string changed in this branch:

- Security card caption: `PASSWORD, TWO-FACTOR AND DEVICES` → `PASSWORD` in production.

The prior `main` commits contain the audit-room opening line, mobile run label, and nav/stepper copy refinements; those were reviewed and committed before this branch, not added here.

## Checks actually run

- `npm run build` — exit 0.
- `npm run test:unit` — 14 files, **75 tests passed**.
- `npm run e2e:smoke` — **9/9** live steps passed (health, two accounts, create/upload/lock/invite/join, locked download, stranger refusal).
- Lighthouse 13.6.0, deployed baseline and local production preview; metrics in `BASELINE.md` and `PERF.md`.
- Production preview route sweep: `/demo`, `/console`, `/v/legacy-token` → “Nothing here”; `/` → one `main#main`.
- Bundle report generated with the approved dev dependency.
- `npx playwright test tests/settings.spec.ts` — **13/13 blocked at `account-summary`**. The spec seeds `vl.dash.session` but no bearer token, so every case reaches `/signin` before the card mounts. The same failure occurs against a demo-flagged dev server. No assertion was changed.

## Not verified / limitations

- The branch is **not deployed**; all post-fix performance numbers are local preview numbers.
- Mobile LCP/TBT remain over budget.
- Supabase region/database RTT is unavailable without a sanitized host.
- APIMatic is intentionally out of scope.
- The full five-state audit room was not re-screenshotted in this pass; the prior room matrix and tests remain the evidence.
