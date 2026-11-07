# UI audit resume

## Where this stands

- PASS 1 inventory: `docs/ui-audit/matrix.md`.
- PASS 2 sweep: `scripts/ui-sweep.mjs`, `npm run ui:sweep`; route filter fixed.
- Full matrix: **126 cells, P0 0 / P1 0 / P2 299**, chromium at six viewports, axe at 390 and 1440.
- PASS 5 fixes: six P1 groups fixed and verified by the full re-run.
- Decisions: `docs/ui-audit/DECISIONS.md`. Report: `docs/ui-audit/REPORT.md`.

## Next, in order

1. Stress cells (`--stress` is parsed but not implemented): long/unbroken names, RTL/CJK/emoji, 254-char email, 60 vaults, 1,000 events, 500 files, failed image, slow load.
2. Environment cells: 200%/400% zoom, text-only 200%, forced colors, dark scheme, print receipts.
3. Firefox: `npx playwright install firefox` (needs approval), then `--browsers=chromium,webkit,firefox`.
4. Eye review of the remaining shots; known unfixed: ledger empty card, bottom-bar clearance.
5. Re-run the Playwright suite (142 tests) after the CSS/ARIA edits.
6. Optional P2 work: `.dash-kpis` keyboard focus, reserved-height KPI skeleton for CLS.

## Commands

```bash
npm run dev -- --port 5173 --strictPort
npm run ui:sweep
node scripts/ui-sweep.mjs --routes=/dashboard --viewports=390,768,1024,1440
node scripts/ui-sweep.mjs --viewports=390,1440 --browsers=chromium,webkit
```

## Notes

- The sweep needs the dev server on 127.0.0.1:5173; it does not start one.
- `--routes` accepts `/dashboard`, `dashboard`, or a path mangled by Git Bash.
- Demo mode plus a seeded `vl.dash.session` is how a role is reached; `/api/**` is stubbed.
- Screenshots are viewport-only, named `<state>-<width>-<engine>.png`, gitignored.
