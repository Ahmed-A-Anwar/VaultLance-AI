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
- Mobile landing copy prerendered from the shared `HeroCopy` at build time; React removes the shell after handoff.
- Landing's nested `main` removed.
- Mock 2FA and device list hidden outside a demo-enabled build.
- `/demo`, `/console`, `/v/:token`, `/v/:token/files` gated out of production routes.
- Shared touch/focus layer added.
- Approved dev dependency: `vite-bundle-visualizer`.

## What remains

1. Mobile LCP now **passes locally** at 753.5 ms (observed 456 ms, score 85); desktop is 887.4 ms (score 98). The prerender is the change that moved it.
2. TBT remains **573 ms**, over the 200 ms budget. The main bundle is 150.9 KiB gzip and still carries GSAP through `HeroVault`/`VaultLayout`; reducing main-thread work is the next performance target.
3. Re-drive the five audit-room states at 390/1024/1440 before calling the room regression complete.
4. Get a sanitized Supabase host/region if database RTT is required.
5. Deploy only with explicit authorization; then run the same Lighthouse and route checks against the deployed preview/production and compare.

## Do not

- Do not add APIMatic or simulate it.
- Do not change money, state-machine, auth, or security rules.
- Do not change golden-ratio tokens, spacing, colour, or type values.
- Do not claim the deployed app improved until it is deployed and measured.
