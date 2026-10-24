# VaultPay AI hero — build record

Landing top section built around frame 1 of the vault sequence. Everything below is
measured on the running page, not asserted.

## Asset + sampled colour

Frame: `public/vault-frames/f_001.webp` — **1920 × 1080, 3 channels** (sharp).

Edge samples (3% / 97% only, never the centre):

| region | left | right |
| --- | --- | --- |
| top | `#adb4b4` | `#a9b3b2` |
| middle | `#b7bebd` | `#b7bebd` |
| bottom | `#ced5d5` | `#dae0e0` |

Page gradient uses the spec's representative stops `#c9d0d2 → #d5dbdc → #e1e7e8`
(the real samples skew slightly cooler and darker; both sets are logged).

Grain is the CSS-only repeating-radial-gradient at `opacity: 0.04` — no SVG file,
no data URI, no markup.

## Wheel layer — cropped, not the fallback

`scripts/crop-wheel.mjs` crops the handwheel from the frame with sharp at
**r = 68 px** around the measured hub `(1028, 537)`, applies a feathered circular
alpha mask, and writes `public/vault-frames/wheel.png` (136 × 136 RGBA).
It is placed at the measured wheel centre `53.54% / 49.72%` of the drawn rect and
rotated as its own layer. No conic-gradient fallback was needed.

## Hotspots (percent of the drawn image rect)

Measured on the real frame; corrected where the reference values were off by >1%.

| hotspot | spec | used | why |
| --- | --- | --- | --- |
| wheel centre | 53.3 / 50.0 | 53.54 / 49.72 | crop centre, so the PNG lands on its own pixels |
| keypad | 59.6 / 50.0, 3.2 × 6.5 | same | within 1% |
| upper dial | 59.4 / 38.0 | same | within 1% |
| lower dial | 59.4 / 61.8 | 59.4 / **60.4** | measured 60.2, 1.6% off |
| handle | 63.7 / y 36–63 | 63.8 / **y 39–60.5** | measured 39.3–60.2 |
| hinge bars | x 52.5, y 28 / 70 | same | within 1% |
| door seam | "outline of the door plate" | rounded rect 41.7–61.5% x, 25.5–73% y | the plate outline, not a small quad |

## Golden-ratio geometry (measured, reduced motion so nothing is mid-animation)

| width | wheel centre | Sign up top | button height | gap | overflow-x |
| --- | --- | --- | --- | --- | --- |
| 375 | 53.96% / 30.89% | 113.3% | 55 | stacked | 0 |
| 768 | 53.96% / 30.87% | 90.5% | 55 | stacked | 0 |
| 1024 | **61.80% / 50.00%** | 74.8% | 55 | wraps to stacked | 0 |
| 1440 | **61.80% / 50.00%** | **61.80%** | 55 | 21 | 0 |
| 1920 | **61.80% / 50.00%** | **61.80%** | 55 | 21 | 0 |

H1 renders at 42 / 42 / 48.1 / 67.7 / 68 px — the spec clamp
`clamp(42px, 4.7vw, 68px)`.

## Contrast (WCAG, computed)

| pair | top stop | mid stop | bottom stop |
| --- | --- | --- | --- |
| ink `#0e1520` headline | 11.72 | 13.08 | 14.65 |
| slate `#4b5663` body | 4.78 | 5.34 | 5.98 |

Headline AAA, body AA at every gradient stop. Ink on the brass fill 5.82 (AA),
on the brass-light end 9.84, on the glass button 15.52.

## Verification

- `npm run build` → clean, 0 type errors (`tsc --noEmit` included).
- Entrance: chips reach opacity 1 at 3.16 s from navigation, timeline starts at
  ~0.72 s → completes **2.44 s after start**, inside the 2.618 s budget.
- CLS: **0.00** at 375 / 768 / 1024 / 1440 / 1920 and **0.00** with motion enabled
  (fonts self-hosted + preloaded, overlay hidden until the frame is drawn).
- Idle float confirmed moving (`y 3.0 → 7.2` over 700 ms, ±8 px / 6.18 s).
- Scroll handoff: copy opacity `1 → 0.63 → 0.02` over 0–6% scroll, restores on return.
- Keyboard: Skip link → **Sign up** (3 px teal ring, 3 px offset) → **Sign in**
  (3 px brass ring, 3 px offset). H1 is one `<h1>`; split words are `aria-hidden`
  and the full sentence is in `.sr-only`.
- Sign up hover: seam gold `rgba(226,184,103,0.55)` at 3 px, wheel rotated 55°,
  hinge glint opaque, arrow +5 px, button −2 px, shimmer sweeping.
- Sign in hover: glow 0.9, nine keys lit, dashed teal connector drawn to the keypad
  (dash offset 0), border `rgb(18,165,181)`.
- Click order: Sign up → `/signup`, Sign in → `/signin`, both after the 1 s beat.

Screenshots (full size in `docs/hero-shots/`, 820 px copies in `small/`):
`final-375/768/1024/1440/1920.png`, `t0-1440.png`, `t2618-1440.png`,
`hover-signup-1440.png`, `hover-signin-1440.png`.

## Values changed from the spec, and why

1. **Vault anchor cap.** The drawn frame is capped at 112% of viewport width and the
   canvas is feathered. Uncapped, cover-fit at 1024 × 768 drew the vault across the
   text column (grey text on grey metal). The 61.8% / 50% anchor is unchanged.
2. **Buttons sit on the 61.8% line at ≥1366 px.** At 1024–1365 the mandated 68 px
   headline and 44 ch body cannot fit above the line inside a 38.2% column, so the
   CTA block falls into normal flow after the body instead of overlapping it.
   At 1366+ it is absolutely placed at `top: 61.8%` (measured 61.80% at 1440/1920).
3. **Copy spacing.** Left padding is the specified 89 px. Top padding is 55 px
   (unspecified) and the stack gap is 13 px, both from the Fibonacci scale, so the
   text block clears the golden line at 768 px-tall viewports.
4. **Headline width.** No `max-width: 12ch` cap; the column width sets the measure and
   `text-wrap: balance` yields "Pay for / work you've / actually / tested."
5. **Hotspot corrections** listed in the table above (±1% rule applied).
6. **Wheel crop radius** is 68 px (the wheel's own rim) rather than 4.2% of image
   width, because that percentage describes the hub radius and left a visible disc of
   plate behind in the rotated copy.
7. **Grain** is CSS-only at 4% as instructed, not a 3% SVG noise layer.
8. **Routes.** `/signup` and `/signin` are not registered in `App.tsx` yet, so the
   1 s-delayed navigation lands on the catch-all route until those pages exist.
