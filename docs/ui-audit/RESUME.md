# UI audit resume

## Where this stands

- PASS 1 inventory: `docs/ui-audit/matrix.md`.
- PASS 2 sweep: `scripts/ui-sweep.mjs`, `npm run ui:sweep`, 126 cells on chromium, issues in `docs/ui-audit/issues.json`, shots in `docs/ui-audit/shots/` (gitignored).
- PASS 5 fixes: six P1 groups fixed; affected cells re-run to **P0 0 / P1 0**.
- Decisions: `docs/ui-audit/DECISIONS.md`.
- Report: `docs/ui-audit/REPORT.md`.

## Next, in order

1. Full matrix re-run: `npm run ui:sweep` (126 cells) and compare against `docs/ui-audit/evidence/before.json`.
2. Add `--stress` cells: long/unbroken names, RTL/CJK/emoji, 254-char email, 60 vaults, 1,000 events, 500 files, failed image, slow load.
3. Environment cells: 200%/400% zoom, text-only 200%, forced colors, dark scheme, print receipts.
4. Eye review of the remaining shots; the client ledger empty card and bottom-bar clearance are the known unfixed items.
5. Decide on Firefox: `npx playwright install firefox` (needs approval) then add `--browsers=chromium,webkit,firefox`.
6. Re-run `npm test` (Playwright) after the CSS/ARIA edits.

## Commands

```bash
npm run dev -- --port 5173 --strictPort
npm run ui:sweep
node scripts/ui-sweep.mjs --routes=/dashboard --viewports=390,768,1024,1440
node scripts/ui-sweep.mjs --browsers=chromium,webkit
```

## Notes

- The sweep needs the dev server on 127.0.0.1:5173; it does not start one.
- Demo mode plus seeded `vl.dash.session` is how a role is reached; `/api/**` is stubbed.
- Screenshots are viewport-only and named `<state>-<width>-<engine>.png`.
- `docs/ui-audit/shots/` and `evidence/` are gitignored; everything else here is tracked.
