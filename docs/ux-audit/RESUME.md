# UX audit resume

## Done

- STEP 0 preflight: chromium/webkit OK, firefox blocked, axe 4.14.0 present,
  buyer login 200 (CLIENT), 14 routes.
- PASS 1 (partial): F1, F2, F4 walked; evidence in `evidence/flows.json`;
  screenshots in `shots/` (ignored); write-ups in `flows/`.
- Fix: per-route document titles, verified.
- axe: 0 serious/critical on playground, signin, dashboard.

## Next

1. ~~F2 demo submit~~ — it already answers in 1.01 s; the probe was wrong and is
   fixed. Flow passes.
2. ~~F3 client~~ — passes (7.8 s); inert download fixed in `ManifestRow`.
   Portal header still claims HELD on a captured vault (decision needed).
3. ~~F5 recovery~~ — passes: wrong password, expired/invalid reset, dead PayPal
   return, rejected upload, failed payout retry, stubbed 429 all recover.
4. ~~F6 account~~ — passes; profile, password, sessions, delete blockers and
   sign-out all behave, and the blocked delete offers only the way to each vault.
5. Remaining: 500/hang/malformed/401 variants, `strings.md`, `MANUAL.md`,
   200%/400% zoom and forced colors.
3. ~~Keyboard F1–F4~~ — walked; signup and route-change focus fixed. Landing's
   nav is tabbable before the intro reveal (open, sev 2).
4. `strings.md` extraction and the plain-language pass on authorize/capture/void.
5. `MANUAL.md` screen-reader steps; zoom 200%/400%; forced colors.
6. Report counts by severity, before/after.

## Commands

```bash
npm run dev -- --port 5173 --strictPort
node scripts/ux-flows.mjs
```

## Notes

- Demo mode plus `?demo=1`; API reads are stubbed by the flow script.
- `docs/ux-audit/shots/` and `evidence/` are gitignored.
- Firefox still needs an approved `npx playwright install firefox`.
