# E2E resume

## Current point

- Full money loop: **PASS 7/7** (run `2026-11-07T18:20:55Z`), 3 captures (the per-run cap).
- Security/attack suite: **PASS 20/20**.
- Smoke: `npm run e2e:smoke` **9/9 in 11s**.
- Two defects fixed: auth cold-start deadline, invite-link copy. Frontend typecheck 0, unit 75/75.
- Evidence: `docs/e2e/evidence/*.json` (ignored).

## Next

1. Optional: add the playground path and signed-URL expiry to the smoke-adjacent suite (both are
   already covered by the full runner).
2. Test data: all leftovers are prefixed `e2e-<timestamp>-`; no vault-delete endpoint exists.

## Deployed verification (2026-11-07T18:36Z)

- Commit `983ab60` pushed to `main`; Vercel deployed it (entry chunk `index-A7a5rpRo.js` carries the
  45s auth deadline).
- Fly machine stopped, then a freelancer signed up through deployed `/signup`: **PASS**, 10.1s
  click-to-answer — past the old 10s deadline. The machine woke and is running again.

## Commands

```bash
npm run e2e:smoke
E2E_HEADLESS=1 E2E_FORCE_NEW=1 node --env-file=backend/.env --env-file=backend/.env.E2E scripts/e2e-live-v2.mjs
node --env-file=backend/.env --env-file=backend/.env.E2E scripts/e2e-security.mjs
E2E_HEADLESS=1 node --env-file=backend/.env --env-file=backend/.env.E2E scripts/e2e-probe.mjs
```

## Environment

- API base can arrive as either `https://vaultlance-ai.fly.dev` or with `/api`; normalize before appending a path.
- PayPal webhook is registered with `EVENT_NAMES=*`; Fly has `PAYPAL_WEBHOOK_ID`, local does not.
- The Fly app autostops; cold start is real and must be measured.
- Auth calls now allow 45s (`AUTH_TIMEOUT_MS` in `src/lib/authApi.ts`); other calls keep 10s.
