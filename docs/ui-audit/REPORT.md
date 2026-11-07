# UI audit report

Run 2026-11-07. Harness: `scripts/ui-sweep.mjs` (`npm run ui:sweep`), chromium
156 + webkit 27.2, demo mode with stubbed API reads. No real row was created.

## Counts

| Pass | Cells | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| Full matrix (chromium, 6 viewports, 21 routes) | 126 | 0 | 107 | 289 | 0 |
| Affected cells after fixes (4 viewports, axe on) | 44 | 0 | 33 | 208 | 0 |
| Final affected re-run (`/dashboard`, `/demo`, `/vault/new`) | 8 | **0** | **0** | 16 | 0 |

The 107 → 0 drop is on the cells that were re-run, not on a second full matrix.
A full 126-cell re-run is the next step (see RESUME).

## Fixed (P1)

| ID | Defect | Cause | Fix |
|---|---|---|---|
| ui-kpi | Freelancer KPI labels clipped to 17px at 768 and 50px at 1024 | `.fd-band` kept its 1.618fr/1fr split below 1280, leaving three 66px cards | stack `.fd-band` under 1280; ratio returns when both columns fit (`freelancer.css`) |
| ui-tap-cta | "New vault" and "Audit now →" primary buttons 34px tall on phones | `.dash-cta`/`.dash-btn-primary` shipped desktop height at mobile | 44px height for primary actions at ≤767 (`dashboard.css`) |
| ui-axe-zip | `/vault/new` file input had no accessible name (critical) | `#zipfile` had no label | `aria-label="Delivery zip file"` |
| ui-axe-list | Manifest `role="list"` had non-listitem children (critical) | header row and rows lacked roles | header `role="presentation"`, each row `role="listitem"` |
| ui-clip-ids | Ledger ids/type, PayPal ids and payout reasons clipped without an intended-ellipsis marker | ellipsis was intended but unmarked | `data-ellipsis` on ledger id/type, payout reason, PayPal ids, card hint, vault project, account name |
| ui-clip-kpi | KPI label ellipsis hid the whole word | same band bug as ui-kpi | fixed by the band stack |

## Remaining

| Severity | Issue | Why it remains |
|---|---|---|
| P2 | 16 in the final subset: control heights (34px vs the 55px spec), scrollable KPI strip not focusable, CLS up to 0.74 on the mobile overview, secondary chips/tabs below 44px | Compact dashboard controls are a deliberate system choice; changing all of them is a redesign, logged in DECISIONS. The KPI strip's keyboard access and the overview's data-load shift need a shared-component change and a separate measurement. |
| P3 | none recorded | — |

## Not run (honest gaps)

- **Firefox**: binary not installed; the install question was skipped. Blocked, not passed.
- **Stress states** (80-char names, RTL/CJK/emoji, 254-char email, 60 vaults, 1,000 events, 500 files, failed image, slow load): matrix documents them; the sweep stubs two vaults and two events only.
- **Zoom 200%/400%, text-only 200%, forced colors, dark scheme, print receipts**: not executed.
- **Reduced motion**: covered by existing `tests/reduced-motion.spec.ts` (listed, not re-run this pass).
- **Whole-matrix regression after fixes**: only the affected cells were re-run.
- **Eye review**: three screens reviewed (freelancer overview 390, client ledger 390, client payments 390). The ledger's tall empty card and the card content sitting under the bottom bar are noted, unfixed.

## Verification

- `npm run typecheck` 0
- `npm run test:unit` 75/75 (14 files)
- Playwright suite: 142 tests / 15 files, not re-run after these CSS/ARIA edits.
- `npm run ui:sweep` exits 1 on any P0/P1; it now exits 0 on the re-run cells.
