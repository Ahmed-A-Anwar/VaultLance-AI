# Laws audit — performance and latency

## Budget

The target is a usable first screen and a decision that acknowledges input inside a second. The numbers are budgets, not claims that every deployed path already meets them.

| Metric | Budget | Deployed baseline | Local final | Status |
|---|---:|---:|---:|---|
| LCP, mobile | ≤ 2.5 s | 6.67 s | 4.31 s | **BLOCKED** |
| LCP, desktop | ≤ 2.5 s | 6.30 s | 1.0 s | PASS local |
| TBT / INP proxy, mobile | ≤ 200 ms | 550 ms | 583 ms | **FAIL** |
| TBT / INP proxy, desktop | ≤ 200 ms | 0 ms | 10 ms | PASS |
| CLS | ≤ 0.1 | 0.001 | 0.000 | PASS |
| TTFB, frontend | ≤ 800 ms | ~1.98 s in the trace; 1.015 s median RTT sample | 20 ms loopback | **FAIL deployed** |
| API warm `/health` p50 | ≤ 300 ms | 0.844 s | not re-run | **FAIL external** |
| Initial JS | ≤ 250 KiB gzip | 150.7 KiB | 150.7 KiB | PASS, but the main bundle is still the LCP path |
| Route transition | ≤ 400 ms | not measured | not measured | UNMEASURED |

The deployed and local columns are not a controlled A/B: the deployed build is older, the network is different, and the local preview has no edge latency. The local column proves the current code's shape; it does not prove production performance.

## What the baseline showed

- The LCP element was **`p.hero-body`**, not the vault image.
- The entrance set the page, headline, and body to `opacity: 0`; the body then waited for the timeline after the boot gate.
- The gate waited for `document.fonts.ready` with no cap.
- The total page was **2,129 KiB**; the initial `index` chunk was 150.7 KiB gzip, with a separate 325.9 KiB gzip GSAP chunk.
- Unused JavaScript was ~101 KiB on the deployed build and ~98 KiB locally.
- API warm `/health` was 0.85 s, so a screen that blocks on it spends most of the Doherty budget before it can show useful state.

## Changes made

1. Hero body and headline paint at `opacity: 1`; their entrance is positional only (`y` 34/21 → 0). The stage and CTAs still fade. The latest pass removed the transforms entirely: the copy is static, not merely opacity-1.
2. The boot gate's font wait is capped at 1,500 ms.
3. Phones skip the first-run gate: both the React gate and the static curtain in `index.html` return on `max-width: 767px`. The gate remains a desktop flourish.
4. All three hero faces use `font-display: swap`; only the body face (Inter) is preloaded. Fraunces and JetBrains Mono load when used.
5. On phones the automatic keypad/wheel demo and its 96-frame prefetch are disabled; the clip starts only from a tap. On desktop the prefetch is delayed to 2.5 s and an idle callback.
6. `HeroButtons` and its clip player are a lazy chunk, mounted after the first animation frame; the landing copy and CTA markup paint without waiting for the button controller.
7. The landing no longer nests a second `main` inside `Hero`.
8. Mock 2FA and session controls are not rendered in production.
9. Demo/legacy routes are not registered in production.

The first six are the measurable performance changes. The last three are trust/route changes, not a bundle-size claim.

## Measured attempts

All numbers are Lighthouse 13.6, mobile emulation, against the production preview on loopback. The raw traces are in `docs/laws-audit/lighthouse-lcp-*.json`.

| Attempt | LCP | FCP | TBT | Score | Result |
|---|---:|---:|---:|---:|---|
| Baseline before this pass | 4,551.6 ms | 777 ms | 694 ms | 66 | reference |
| Phone gate skip | 4,509.5 ms | 771 ms | 484.5 ms | 71 | no LCP gain |
| Static hero copy (no transform) | 4,524.6 ms | 1,777 ms | 439 ms | 71 | no LCP gain |
| Font swap + one preload | 4,270.6 ms | 750.3 ms | 561.5 ms | 71 | best kept change |
| Phone clips off | 4,339 ms | 810 ms | 444 ms | 74 | no LCP gain |
| Static shell (discarded) | 4,256.8 ms | 755.1 ms | 444.4 ms | 74 | React was still the final LCP node |
| Static shell sized (discarded) | 4,270.2 ms | 750.6 ms | 365.2 ms | 76 | still replaced by the React paragraph |
| Final split (kept) | **4,308 ms** | **810 ms** | **583 ms** | **70** | **BLOCKED** |

The final run's observed LCP is **743 ms**, observed FCP **244 ms**, and TBT **583 ms**. The modeled LCP is 4.308 s because Lighthouse projects the 150.7 KiB main bundle and React execution onto a slow mobile network; the local loopback paint itself is already under the budget.

## The static-shell experiment

A static `p.hero-body` in `index.html` painted at **156 ms** and was a valid LCP candidate. The React paragraph then painted at **604–664 ms** with a larger area (**48,077 px** vs **37,927 px**) and replaced it. Constraining the static paragraph did not change the final LCP node. The shell was removed: keeping a duplicate, inaccessible copy for no metric gain would be worse than the plain React path.

## Remaining bottleneck

Mobile LCP is **4.31 s modeled / 743 ms observed** on loopback. The remaining cost is architectural, not animation setup:

- The copy is rendered by React from the 150.7 KiB main bundle; the initial HTML still has an empty `#root`.
- GSAP is still bundled in the main chunk through `HeroVault`/`VaultLayout`; the lazy `HeroButtons` chunk does not remove it from the first execution path.
- Removing or deferring more animation code cannot move the modeled metric while the reading copy still waits for that bundle.

The next honest step would be to render the landing copy into the initial HTML (prerender/SSR or a deliberate static landing entry) or cut the main bundle substantially. Both are architecture changes, not law-polish changes, and were not made here.

The API's 0.85 s warm response and cold-start outliers are external to this frontend pass; the UI should show useful shell/state without waiting for `/health`.

## Commands

```bash
# production build
npm run build

# unit suite
npm run test:unit

# live API smoke (reads backend/.env + backend/.env.E2E; prints only masked ids)
npm run e2e:smoke

# Lighthouse against a local production preview
node node_modules/vite/bin/vite.js preview --port 4173 --strictPort
CHROME_PATH="C:\Users\pc\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe" \
npx lighthouse http://127.0.0.1:4173/ \
  --only-categories=performance \
  --output=json --output-path=docs/laws-audit/lighthouse-lcp-final.json \
  --quiet --chrome-flags="--headless=new --no-sandbox"

# bundle analysis (approved dev dependency)
npx vite-bundle-visualizer -t raw-data -o docs/laws-audit/bundle.json
```

## When to stop

This pass made seven measured attempts. Mobile LCP remains above 2.5 s, so it is recorded as **BLOCKED** with the traces rather than claimed as met. The safe changes above remain; the static-shell workaround does not.
