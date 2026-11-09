# Laws audit — performance and latency

## Budget

The target is a usable first screen and a decision that acknowledges input inside a second. The numbers are budgets, not claims that every deployed path already meets them.

| Metric | Budget | Deployed baseline | Local final | Status |
|---|---:|---:|---:|---|
| LCP, mobile | ≤ 2.5 s | 6.67 s | **0.754 s** | **PASS local** |
| LCP, desktop | ≤ 2.5 s | 6.30 s | **0.887 s** | PASS local |
| TBT / INP proxy, mobile | ≤ 200 ms | 550 ms | 573 ms | **FAIL** |
| TBT / INP proxy, desktop | ≤ 200 ms | 0 ms | 9 ms | PASS |
| CLS | ≤ 0.1 | 0.001 | 0 | PASS |
| TTFB, frontend | ≤ 800 ms | ~1.98 s in the trace; 1.015 s median RTT sample | 20 ms loopback | **FAIL deployed** |
| API warm `/health` p50 | ≤ 300 ms | 0.844 s | not re-run | **FAIL external** |
| Initial JS | ≤ 250 KiB gzip | 150.7 KiB | 150.9 KiB | PASS |
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

1. Hero body and headline paint at `opacity: 1`; their entrance is positional only (`y` 34/21 → 0). The latest pass removed the transforms entirely: the copy is static, not merely opacity-1.
2. The boot gate's font wait is capped at 1,500 ms.
3. Phones skip the first-run gate: both the React gate and the static curtain in `index.html` return on `max-width: 767px`. The gate remains a desktop flourish.
4. All three hero faces use `font-display: swap`; only the body face (Inter) is preloaded. Fraunces and JetBrains Mono load when used.
5. On phones the automatic keypad/wheel demo and its 96-frame prefetch are disabled; the clip starts only from a tap. On desktop the prefetch is delayed to 2.5 s and an idle callback.
6. `HeroButtons` and its clip player are a lazy chunk, mounted after the first animation frame; the landing copy and CTA markup paint without waiting for the button controller.
7. **The mobile landing copy is prerendered into `index.html`.** A Vite `transformIndexHtml` plugin renders the shared `HeroCopy` component to static markup. The shell is absolute, above the app, visible below 768 px on `/`, and removed two frames after React's first commit. The static paragraph is the same width and height as the React one, and its paint is the LCP entry.
8. The landing no longer nests a second `main` inside `Hero`.
9. Mock 2FA and session controls are not rendered in production.
10. Demo/legacy routes are not registered in production.

The first seven are the measurable performance changes. The last three are trust/route changes, not a bundle-size claim.

## Measured attempts

All numbers are Lighthouse 13.6, mobile emulation, against the production preview on loopback. The raw traces are in `docs/laws-audit/lighthouse-*.json`.

| Attempt | LCP | FCP | TBT | Score | Result |
|---|---:|---:|---:|---:|---|
| Baseline before this pass | 4,551.6 ms | 777 ms | 694 ms | 66 | reference |
| Phone gate skip | 4,509.5 ms | 771 ms | 484.5 ms | 71 | no LCP gain |
| Static hero copy (no transform) | 4,524.6 ms | 1,777 ms | 439 ms | 71 | no LCP gain |
| Font swap + one preload | 4,270.6 ms | 750.3 ms | 561.5 ms | 71 | kept, still over |
| Phone clips off | 4,339 ms | 810 ms | 444 ms | 74 | no LCP gain |
| Static shell (discarded) | 4,256.8 ms | 755.1 ms | 444.4 ms | 74 | React remained LCP |
| Static shell sized (discarded) | 4,270.2 ms | 750.6 ms | 365.2 ms | 76 | React remained LCP |
| Split before prerender | 4,308 ms | 810 ms | 583 ms | 70 | still over |
| **Prerendered HeroCopy** | **753.5 ms** | **753.5 ms** | **573 ms** | **85** | **PASS** |

The final run's observed LCP is **456 ms**, observed FCP **456 ms**, and CLS **0**. The modeled LCP is 753.5 ms, below the 2.5 s budget. The initial JS is 150.9 KiB gzip; the prerendered HTML adds about 2.6 KiB (7.44 KiB total index).

The Lighthouse DOM audit is empty for the LCP node because the shell is removed after the handoff. Playwright on the same preview recorded the prerendered `p.hero-body` at **592 ms** with a **55,050 px** area; the React paragraph is 48,077 px. The static entry therefore survives the later React paint and remains the LCP.

Desktop Lighthouse also improved: **LCP 887.4 ms**, performance **98**, TBT 9 ms, CLS 0.00025.

## Remaining bottleneck

Mobile LCP is solved for this local build, but **TBT is still 573 ms** (budget 200 ms). The main bundle remains 150.9 KiB gzip and carries GSAP through `HeroVault`/`VaultLayout`; the lazy `HeroButtons` chunk and the prerendered shell do not remove that initial execution cost. The next performance target is main-thread work, not first paint.

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
  --output=json --output-path=docs/laws-audit/lighthouse-lcp-prerendered.json \
  --quiet --chrome-flags="--headless=new --no-sandbox"

# desktop comparison
CHROME_PATH="C:\Users\pc\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe" \
npx lighthouse http://127.0.0.1:4173/ --preset=desktop \
  --only-categories=performance \
  --output=json --output-path=docs/laws-audit/lighthouse-desktop-prerendered.json \
  --quiet --chrome-flags="--headless=new --no-sandbox"

# bundle analysis (approved dev dependency)
npx vite-bundle-visualizer -t raw-data -o docs/laws-audit/bundle.json
```

## When to stop

The requested mobile LCP budget is met locally: **753.5 ms**, after the measured attempts above. TBT remains over budget and is recorded separately; do not claim a deployed gain until the app is deployed and measured again.
