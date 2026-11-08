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
2. F3, F5, F6: client pay/approve/download; wrong password, expired reset,
   bad invite, upload reject, cancelled payment, payout retry, offline/slow,
   API 500/429/hang/malformed/401 via stubs.
3. Full keyboard run of F1–F4; tab order per page; focus after route change.
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
