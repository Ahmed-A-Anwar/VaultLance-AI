# Laws audit — performance and latency

## Budget

The target is a usable first screen and a decision that acknowledges input inside a second. The numbers are budgets, not claims that every deployed path already meets them.

| Metric | Budget | Deployed baseline | Local post-fix | Status |
|---|---:|---:|---:|---|
| LCP, mobile | ≤ 2.5 s | 6.67 s | 4.4 s | **FAIL** |
| LCP, desktop | ≤ 2.5 s | 6.30 s | 1.0 s | PASS local |
| TBT / INP proxy, mobile | ≤ 200 ms | 550 ms | 490 ms | **FAIL** |
| TBT / INP proxy, desktop | ≤ 200 ms | 0 ms | 10 ms | PASS |
| CLS | ≤ 0.1 | 0.001 | 0.001 | PASS |
| TTFB, frontend | ≤ 800 ms | ~1.98 s in the trace; 1.015 s median RTT sample | 20 ms loopback | **FAIL deployed** |
| API warm `/health` p50 | ≤ 300 ms | 0.844 s | not re-run | **FAIL external** |
| Initial JS | ≤ 250 KiB gzip | 150.7 KiB | 150.7 KiB | PASS, but 98 KiB unused |
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

1. Hero body and headline paint at `opacity: 1`; their entrance is positional only (`y` 34/21 → 0). The stage and CTAs still fade.
2. The boot gate's font wait is capped at 1,500 ms.
3. The landing no longer nests a second `main` inside `Hero`.
4. Mock 2FA and session controls are not rendered in production.
5. Demo/legacy routes are not registered in production.

The first two are the measurable performance changes. The last two are trust/route changes, not a bundle-size claim.

## Commands

```bash
# production build
npm run build

# unit suite
npm run test:unit

# live API smoke (reads backend/.env + backend/.env.E2E; prints only masked ids)
npm run e2e:smoke

# Lighthouse against a local production preview
npm run preview -- --port 4173 --strictPort
npx lighthouse http://127.0.0.1:4173/ \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=docs/laws-audit/lighthouse-local-mobile.json
npx lighthouse http://127.0.0.1:4173/ --preset=desktop \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=docs/laws-audit/lighthouse-local-desktop.json

# bundle analysis (approved dev dependency)
npx vite-bundle-visualizer -t raw-data -o docs/laws-audit/bundle.json
```

## Remaining bottleneck

Mobile LCP is **4.4 s** on loopback. The next honest attempts are:

1. Make the first-run boot gate optional or shorter on slow connections; it is still the largest controllable first-screen delay.
2. Split the initial GSAP/entry bundle or delay non-critical animation setup until after the copy is interactive.
3. Re-run Lighthouse against a deployed preview before claiming a production gain.

The API's 0.85 s warm response and cold-start outliers are external to this frontend pass; the UI should show useful shell/state without waiting for `/health`.

## When to stop

If the mobile LCP remains above 2.5 s after three measured attempts, record it as **BLOCKED** with the trace rather than claiming the budget is met.
