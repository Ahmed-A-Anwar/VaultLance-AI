# UI audit report

Run 2026-11-07. Harness: `scripts/ui-sweep.mjs` (`npm run ui:sweep`), chromium
156 + webkit 27.2, demo mode with stubbed API reads. No real row was created.

## Counts

| Pass | Cells | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| Full matrix, first pass (6 viewports, 21 routes) | 126 | 0 | 107 | 289 | 0 |
| Full matrix, after the first fixes | 126 | **0** | **9** | 294 | 0 |
| Affected cells, axe on (4 viewports) | 44 | 0 | 0 | 16 | 0 |

The last row covers `/dashboard`, `/demo` and `/vault/new` only. The nine P1s
found in the second full matrix — a 34px "New vault" at 768px and two clipped
PayPal ids on Earnings at 1280/1440 — were fixed afterwards, but the targeted
re-run returned **0 cells** (the `--routes` filter matched nothing), so those
nine are **fixed in code, not yet re-verified**. That filter bug is the first
item in RESUME.

## Fixed (P1)

| ID | Defect | Cause | Fix |
|---|---|---|---|
| ui-kpi | Freelancer KPI labels clipped to 17px at 768 and 50px at 1024 | `.fd-band` kept its 1.618fr/1fr split below 1280, leaving three 66px cards | stack `.fd-band` under 1280; ratio returns when both columns fit |
| ui-tap-cta | "New vault" / "Audit now →" primary actions 34px tall at ≤768 | desktop height shipped to phones | 44px at ≤767, and ≤768 for the freelancer CTA |
| ui-axe-zip | `/vault/new` file input had no accessible name (critical) | `#zipfile` unlabelled | `aria-label="Delivery zip file"` |
| ui-axe-list | Manifest `role="list"` had non-listitem children (critical) | header and rows had no roles | header `role="presentation"`, rows `role="listitem"` |
| ui-clip-ids | Ledger ids/type, PayPal ids, payout reasons, card hints, vault project, account name clipped without an intended-ellipsis marker | ellipsis intended but unmarked | `data-ellipsis` on each |
| ui-kpi-2 | KPI label ellipsis hid the whole word | same band bug | fixed by the band stack |

## Remaining

| Severity | Issue | Why it remains |
|---|---|---|
| P1 | 9: tablet CTA height, two Earnings ids | fixed in code after the run; targeted verification did not execute |
| P2 | ~294: 34px compact controls, scrollable KPI strip not focusable, CLS up to 0.74 on the mobile overview, secondary chips/tabs under 44px | Compact dashboard controls are a deliberate system choice; changing them all is a redesign. Keyboard access and the overview load shift need a shared-component change plus measurement. |
| P3 | none recorded | — |

## Not run (honest gaps)

- **Firefox**: binary missing; install question skipped. Blocked, not passed.
- **Stress states**: 80-char/unbroken names, RTL/CJK/emoji, 254-char email, 60 vaults, 1,000 events, 500 files, failed image, slow load — documented in matrix, not executed.
- **Zoom 200%/400%, text-only 200%, forced colors, dark scheme, print receipts**: not executed.
- **Eye review**: three screens (freelancer overview 390, client ledger 390, client payments 390). The ledger's tall empty card and content under the bottom bar are noted, unfixed.
- **Whole-matrix regression after the last two fixes**: not run.

## Exit criteria

**Not met.** Zero P0 across the matrix; nine P1 fixed but unverified, ~294 P2
open; stress, zoom and Firefox cells outstanding.

## Verification

- `npm run typecheck` 0
- `npm run test:unit` 75/75 (14 files)
- Playwright suite: 142 tests / 15 files — not re-run after these edits.
- `npm run ui:sweep` exits 1 on any P0/P1.
