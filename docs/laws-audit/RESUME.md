# Laws audit — resume here

## Current state

- Branch: `chore/laws`, based on `main` at `d331e88`.
- Earlier work committed on `main`: `026af60` (audit room), `d331e88` (shared surfaces).
- Production build, unit suite, live API smoke, Lighthouse, bundle report, and route gates have been checked.
- No deploy has been made.

## What is done in this branch

- Hero page/headline/body no longer start at opacity 0; the copy is now fully static.
- Boot gate font wait capped at 1.5 s; phones skip the gate entirely.
- Hero faces use `font-display: swap`; only Inter is preloaded.
- Phone clip demo/prefetch disabled; desktop clip prefetch delayed to 2.5 s.
- `HeroButtons` and its clip player split into a lazy chunk.
- Landing's nested `main` removed.
- Mock 2FA and device list hidden outside a demo-enabled build.
- `/demo`, `/console`, `/v/:token`, `/v/:token/files` gated out of production routes.
- Shared touch/focus layer added.
- Approved dev dependency: `vite-bundle-visualizer`.

## What remains

1. Mobile LCP is **BLOCKED** at 4.308 s modeled / 743 ms observed on local preview; desktop is 1.0 s. Seven measured attempts did not reach 2.5 s. The static-shell experiment was discarded because the React paragraph remained the final LCP node.
2. The next step is architectural: prerender the landing copy into the initial HTML or cut the 150.7 KiB main bundle (GSAP is still in it through `HeroVault`/`VaultLayout`). Do not claim the budget is met.
3. Re-drive the five audit-room states at 390/1024/1440 before calling the room regression complete.
4. Get a sanitized Supabase host/region if database RTT is required.
5. Deploy only with explicit authorization; then run the same Lighthouse and route checks against the deployed preview/production and compare.

## Do not

- Do not add APIMatic or simulate it.
- Do not change money, state-machine, auth, or security rules.
- Do not change golden-ratio tokens, spacing, colour, or type values.
- Do not claim the deployed app improved until it is deployed and measured.
