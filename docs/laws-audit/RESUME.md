# Laws audit — resume here

## Current state

- Branch: `chore/laws`, based on `main` at `d331e88`.
- Earlier work committed on `main`: `026af60` (audit room), `d331e88` (shared surfaces).
- Production build, unit suite, live API smoke, Lighthouse, bundle report, and route gates have been checked.
- No deploy has been made.

## What is done in this branch

- Hero page/headline/body no longer start at opacity 0.
- Boot gate font wait capped at 1.5 s.
- Landing's nested `main` removed.
- Mock 2FA and device list hidden outside a demo-enabled build.
- `/demo`, `/console`, `/v/:token`, `/v/:token/files` gated out of production routes.
- Shared touch/focus layer added.
- Approved dev dependency: `vite-bundle-visualizer`.

## What remains

1. Mobile LCP is 4.4 s on local preview; desktop is 1.0 s. Try the next measured attempts:
   - shorten or skip the first-run boot gate on slow connections;
   - split/delay non-critical GSAP/entry work;
   - re-run Lighthouse after each attempt.
2. If mobile LCP remains over 2.5 s after three honest attempts, log **BLOCKED** with the trace rather than claiming success.
3. Re-drive the five audit-room states at 390/1024/1440 before calling the room regression complete.
4. Get a sanitized Supabase host/region if database RTT is required.
5. Deploy only with explicit authorization; then run the same Lighthouse and route checks against the deployed preview/production and compare.

## Do not

- Do not add APIMatic or simulate it.
- Do not change money, state-machine, auth, or security rules.
- Do not change golden-ratio tokens, spacing, colour, or type values.
- Do not claim the deployed app improved until it is deployed and measured.
