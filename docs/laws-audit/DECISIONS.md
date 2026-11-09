# Laws audit — decisions

This is the decision log for `chore/laws`. Changes that would alter money, state-machine transitions, authentication, or security rules are out of scope. Golden-ratio tokens, spacing, colour, and type tokens are unchanged.

## D1 — APIMatic is out of scope

The user said to ignore APIMatic for now. It is not merged in `main`, and this branch does not create or simulate it. AG Grid is already merged and is treated as baseline.

## D2 — Existing UI work landed before the branch

The uncommitted audit-room and shared-surface work was reviewed, the production build passed, and it was committed on `main`:

- `026af60` — `ux: refine the audit room`
- `d331e88` — `ux: refine shared surfaces`

`chore/laws` starts from `d331e88`. Generated audit JSON and screenshot artifacts were not included in those commits.

## D3 — Hide mock security controls in production

| Before | After | Why |
|---|---|---|
| Two-factor showed a mock QR, a fixed secret, and accepted code `123456` in every build | Rendered only in a demo-enabled build | Jakob / honesty: a security control that does not secure anything is worse than no control |
| Active sessions showed a made-up device list in demo mode and one synthetic “This browser” row in real mode, with revoke controls that cannot revoke a server device | Hidden outside a demo-enabled build | Same; the server has no device-list model to back the controls |
| Caption read `PASSWORD, TWO-FACTOR AND DEVICES` | Production caption reads `PASSWORD` | Copy required by the hidden blocks; no other copy changed |

There is no production replacement for two-factor or device management in this pass. That is deliberate: adding a half-real security feature would violate the money/security constraint.

## D4 — Hide seeded demo and legacy routes in production

`/demo`, `/console`, `/v/:token`, and `/v/:token/files` are registered only when `demoBuildEnabled()` is true. In a production build they fall through to the existing 404. The pages and their chunks remain in the repository for local/demo review, but a production visitor cannot enter a fabricated signed-in surface.

Verified with the production preview: all three paths rendered “Nothing here. The instrument is over here.”

## D5 — LCP: keep the entrance, stop hiding the reading content

The deployed LCP node was `p.hero-body`. The entrance had set the page, headline, and body to `opacity: 0` and only faded them in after the gate.

Change:

- The hero page no longer starts at `opacity: 0`.
- The headline lines and body keep `opacity: 1`; they still rise 34px/21px on the same timing.
- The stage and CTA buttons still fade, because they are not the reading content.
- The entry gate may still cover the first frame, but it no longer has to wait for an opacity animation on the text.

This is a deliberate priority call: **Doherty/latency over the entrance's original fade**. The motion shape remains; the copy is legible from first paint.

No golden-ratio value, spacing token, colour, type size, or motion duration changed.

## D6 — Cap the boot gate's font wait

The gate waited for `document.fonts.ready` with no bound. On a slow font it held the whole first screen. The wait is now the display font or **1,500 ms**, whichever comes first. A late display font can swap in fallback type for a moment; a gate must not own the first screen indefinitely.

Before/after: unbounded → 1,500 ms. This is the only time-budget value changed. It is documented because it affects first paint, not because it changes the visual system.

## D7 — One main landmark on the landing

`Landing` wrapped `Hero` in a second `<main id="main">`; `Hero` already owns the page main. This produced nested `main` elements and duplicate IDs. `Landing` now returns `Hero` directly.

Verified in the production preview: the landing has exactly one `main#main`.

## D8 — Cross-screen interaction layer

`src/styles/laws-audit.css` adds only shared interaction rules:

- `touch-action: manipulation` on interactive controls (Fitts / touch latency).
- A visible `:focus-visible` ring fallback.
- `scroll-padding-top` so anchored sections clear the fixed chrome.

No layout, colour, type, spacing, or golden-ratio token was changed.

## D9 — Bundle tooling

`vite-bundle-visualizer` was added as a dev dependency only. It has no runtime import. The production build output is unchanged except for the audit CSS and route gating.

## D10 — Supabase region

The exact Supabase host/region is not available without reading a Fly secret. The API health check is green, but no database RTT is claimed. A sanitized project host or dashboard region is still needed to close this.

## D11 — API region discrepancy

The live Fly machine is in `cdg`; `backend/fly.toml` says `primary_region = "fra"`. The discrepancy was recorded, not changed. Changing it is a deployment/config action, not a UX-law change.

## D13 — LCP: phones skip the gate; animation work waits

| Before | After | Why |
|---|---|---|
| Phones showed the first-run gate (minimum 900 ms) before the landing copy | The React gate and the static curtain both return on `max-width: 767px`; desktop keeps the gate | Doherty: the desktop flourish should not own a phone's first screen |
| The hero copy started its entrance from transforms | The headline and body are static; only the vault stage, rim, and CTA buttons animate | A transform on the LCP text delayed the reported paint even when the glyphs were legible |
| All three hero faces used `font-display: block`, and all three were preloaded | All three use `swap`; only Inter (the body face) is preloaded | A slow display face must not keep the reading copy invisible |
| The phone loaded the keypad/wheel demo and its 96-frame prefetch automatically | Phones load clips only from a tap; desktop delays the prefetch to 2.5 s and an idle callback | The frame download and decode are interaction garnish, not first-screen content |
| `HeroButtons` was in the landing chunk | It is a lazy chunk mounted after the first frame | Keeps the CTA clip controller off the landing's first execution path |

No golden-ratio token, spacing value, colour, type size, or motion duration changed. The only time values changed are the phone gate being skipped and the deferred clip prefetch; both are documented here because they affect first paint.

## D14 — Prerender the mobile landing copy

A static copy shell in `index.html` was tried first and discarded: its paragraph was narrower than the React one, so the later React paint replaced it as the LCP.

The final implementation is a real prerender. A Vite `transformIndexHtml` plugin renders the shared `HeroCopy` component with `StaticRouter` and `renderToStaticMarkup`; `index.html` carries the resulting markup in an absolute, mobile-only shell on `/`. The shell is above the app during handoff, and React removes it two frames after its first commit. `src/main.tsx` delays the mobile landing mount by two frames so the static paint is recorded before React can replace it.

Before: mobile LCP waited for the 150.7 KiB main bundle (4.308 s modeled). After: the prerendered `p.hero-body` is the LCP at **753.5 ms modeled / 456 ms observed**, score **85**. Desktop remains on the React path: 887.4 ms, score 98.

No golden-ratio token, spacing value, colour, type size, or motion duration changed. The shell is markup and handoff only.

## D15 — TBT remains over budget

The same final run reports **TBT 573 ms** against a 200 ms budget. The main bundle is still 150.9 KiB gzip and carries GSAP through `HeroVault`/`VaultLayout`; the prerender fixes LCP, not main-thread work. This is recorded as the next performance target rather than folded into the LCP pass.

## D12 — No new features

No new product flow, no new money path, no auth change, and no state-machine change were introduced. The hide list removes surfaces; it does not add replacements.
