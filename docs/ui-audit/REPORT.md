# UI audit report

Run 2026-11-07. Harness: `scripts/ui-sweep.mjs` (`npm run ui:sweep`), chromium
156 + webkit 27.2, demo mode with stubbed API reads. No real row was created.

## Counts

| Pass | Cells | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| Full matrix, first pass (6 viewports, 21 routes) | 126 | 0 | 107 | 289 | 0 |
| Full matrix, after the first fixes | 126 | 0 | 9 | 294 | 0 |
| **Full matrix, final (route filter fixed)** | **126** | **0** | **0** | 299 | 0 |

The final run covers every route × role cell at 390, 768, 1024, 1280, 1440 and
1920, with axe at 390 and 1440. `npm run ui:sweep` exits 0.

## Fixed (P1)

| ID | Defect | Cause | Fix |
|---|---|---|---|
| ui-kpi | Freelancer KPI labels clipped to 17px at 768 and 50px at 1024 | `.fd-band` kept its 1.618fr/1fr split below 1280, leaving three 66px cards | stack `.fd-band` under 1280; the ratio returns when both columns fit |
| ui-tap-cta | "New vault" / "Audit now →" primary actions 34px tall at ≤768 | desktop height shipped to phones | 44px at ≤767, and ≤768 for the freelancer CTA |
| ui-axe-zip | `/vault/new` file input had no accessible name (critical) | `#zipfile` unlabelled | `aria-label="Delivery zip file"` |
| ui-axe-list | Manifest `role="list"` had non-listitem children (critical) | header and rows had no roles | header `role="presentation"`, rows `role="listitem"` |
| ui-clip-ids | Ledger ids/type, PayPal ids, payout reasons, card hints, vault project, account name clipped without an intended-ellipsis marker | ellipsis intended but unmarked | `data-ellipsis` on each |
| ui-filter | `--routes=/dashboard` matched zero cells | Git Bash rewrote the leading slash into a Windows path | filter normalises the argument and fails loudly on no match |

## Remaining (P2, 299 across the matrix)

| Issue | Why it remains |
|---|---|
| 34px compact dashboard controls vs the 55px spec | A deliberate system choice; changing every control is a redesign. The spec's 55/89/144 apply to the gateway and cards, logged in DECISIONS. |
| Secondary chips, tabs and icon buttons below 44px at ≤768 | WCAG 2.2's minimum is 24px and these meet it; the 44px rule is applied to primary actions. |
| Scrollable KPI strip not keyboard-focusable (`.dash-kpis`) | Needs a shared-component change plus a focus-visible design decision. |
| CLS up to 0.74 on the mobile overview | The data load shifts the KPI row; needs a reserved-height skeleton. |
| Ledger's tall empty card on mobile; card content close to the bottom bar | Eye-review findings, unfixed. |

## Not run (honest gaps)

- **Firefox**: binary missing; install question skipped. Blocked, not passed.
- **Stress states**: long/unbroken names, RTL/CJK/emoji, 254-char email, 60 vaults, 1,000 events, 500 files, failed image, slow load. Documented in matrix, not executed.
- **Zoom 200%/400%, text-only 200%, forced colors, dark scheme, print receipts**: not executed.
- **Eye review**: three screens reviewed by eye (freelancer overview 390, client ledger 390, client payments 390); the rest were judged by the automated checks only.

## Exit criteria

Across the chromium matrix: **zero P0 and zero P1**, at all six viewports,
covering every route and role cell. The remaining conditions — firefox, stress
states, zoom/forced-colors/print, and a full eye pass — are **not met**, so the
overall criteria are not yet satisfied.

## Verification

- `npm run typecheck` 0
- `npm run test:unit` 75/75 (14 files)
- Playwright suite: 142 tests / 15 files, not re-run after the CSS/ARIA edits.
- Full sweep: 126 cells, P0 0 / P1 0 / P2 299; exits 0.
