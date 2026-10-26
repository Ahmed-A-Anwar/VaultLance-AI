# VaultLance AI — design plan (written before code)

Direction chosen in [RESEARCH.md](RESEARCH.md): **"The sealed instrument."**
The product behaves like a legal-financial object: a certified document whose ledger
is visible. One offline-first transaction, staged down the landing page, is the demo.

## 1. Colour roles (every hex lives only in `src/styles/tokens.css`)

| Token | Hex | Role & why |
| --- | --- | --- |
| `--paper` | `#EFF1F0` | Page ground — deliberately *cool* chalk, not the #F4F1EA cream cliché; reads like archive stock, not marketing cream |
| `--panel` | `#FFFFFF` | Instrument surfaces (manifest, provenance blocks, portal panels) — the "document" layer |
| `--ink` | `#182029` | All body text; 13.2:1 on `--paper` |
| `--ink-soft` | `#59636D` | Secondary text; 5.0:1 on `--paper` (≥4.5 verified) |
| `--rule` | `#D7DBDE` | Hairlines between ledger rows — thin but #1 ink rules, not decorative |
| `--well` | `#E4E7E6` | Recessed wells (inputs, footer trays) — one step darker than paper |
| `--seal` | `#0E2A43` | Brand "seal wax" deep ink-navy: primary buttons, the vault mark (distinct from any state token) |
| `--seal-ink` | `#0A1F31` | Pressed/active of seal |
| `--held` | `#8A4B10` | HELD money state — escrow brass-amber; text-safe on paper (≥4.5) and never used for "success" |
| `--held-bg` | `#F2E4CC` | Amber tint token bg |
| `--paid` | `#14603B` | PAID/RELEASED — deeper than default green; not acid |
| `--paid-bg` | `#DCEBE0` | Green tint token bg |
| `--failed` | `#9B1C16` | VOIDED/FAIL — oxide red |
| `--failed-bg` | `#F6DDD9` | Red tint token bg |
| `--audit` | `#0F4C81` | AUDITING/COMPUTED — machine blue |
| `--audit-bg` | `#DCE7F2` | Blue tint token bg |

Why this set: three semantic families (brass=money being held, oxide=disagreement,
machine blue=the AI's instruments) on an archive-paper ground, with a deep-navy wax
as the only *brand* colour. No state is ever carried by colour alone — every token
pair carries an SVG mark + label word.

## 2. Type pairing

- **Display + body: Archivo (variable, from `@fontsource-variable/archivo`)** — one
  family, two registers. Display uses the expanded axis at 620 weight (an
  institutional grotesk: stamp-like, wide, unglamorous); body uses regular width,
  480 weight, 1.55 line-height, <80ch measures. Avoids the serif-cream tells and the
  two-font-for-show cliché.
- **Machine voice: IBM Plex Mono (`@fontsource/ibm-plex-mono`)** — reserved strictly
  for what the machine produced: hashes, sizes, ids, timestamps, latency, amounts.
  Amounts additionally get `font-variant-numeric: tabular-nums` and slashed zero is
  kept off (checked rendering) — Plex Mono's zero already disambiguates.
- Scale (px): 13 · 14 · 16 · 20 · 28 · 40 · 56 · 76. Display leading 0.94, tracking −1%.

## 3. Spacing rhythm

4-px base; ledger beats: 8 / 12 / 20 / 32 / 48 / 80 (sections separated by 80, inner
content by 20–32, ledger rows by 0 with 8-px vertical cell padding in `--rule`
hairlines). Landing gutters: max 1120 content column, 24-px page padding at mobile.

## 4. Radius / border logic

Establishment-paper: **radius 10 px on documents, 4 px on controls, 1000 px only on
state tokens**. Borders: 1 px `--rule` hairlines for ledger structure; 1.5 px `--seal`
for primary CTAs (filled). No card shadows — depth comes from the paper/well contrast
only (one exception: the CTA overlay, which lifts, `0 24px 64px rgba(14,42,67,.22)`).

## 5. Component states (every one, exhaustive)

- **StateToken** (SEALED AUDITING HELD CAPTURED VOIDED RELEASED PAID): dot+word+mark;
  default: tinted bg + solid text; focus-visible on interactive variants: 2px offset
  `--seal` ring; loading (AUDITING): dot pulses 1.6s ease; no disabled state (informational).
- **VerdictChip** (PASS WARN FAIL): default PASS = audit-bg/audit ink + check mark;
  WARN = held-bg + held + ⚠ mark (used for the real skipped-test evidence);
  FAIL = failed-bg + failed + × mark. Hover/none (not interactive).
- **ManifestRow**: default: path (sans) + size/hash (mono) + token; hover (desktop,
  `hover:hover and (pointer:fine)` only): bg → `--well`; focus-visible: ring;
  linkage column variants: SEALED = lock mark, non-clickable in client portal
  (`tabindex` removed, aria-disabled'd, role="img"); RELEASED = download button
  (real focusable control); loading: hash shimmer-free — shows "checking…" text;
  error: FAIL chip inline with reason.
- **ProvenanceBlock**: evidence stream entry; enters with 20ms fade (see motion);
  structure: source label + timestamp + payload mono; error state shows redacted
  note; empty state: "No evidence yet — ask a question."
- **FreezeBar**: the held-amount bar; default shows held; capturable stage fades
  `--well` → paid; disabled (voided): hatches + VOIDED token; loading: none (state-driven).
- **AmountReadout**: tabular mono, sizes s/m/l; variant `held` (brass), `paid` (paid green),
  `voided`; reads aria-live="polite" on change.
- **VaultButton (primary CTA)**: default seal fill; hover: `--seal-ink`, no motion
  (colour only); active: scale(0.97) 160ms ease-out; focus-visible: 2px offset ring;
  disabled: well-grey with **its reason text inline** ("Seal vault — needs a brief");
  loading: label swaps to spinner row, width locked.
- **GhostButton**: outline on seal; same state set minus loading spinner (swaps to text).
- **ZipDropZone**: default: dashed `--rule` 1.5px, SVG target mark; hover/dragover:
  seal dashed border 2px + "reading files…" only after real dragover; loading: file count
  resolving; error: failed border + reason (invalid file type); done: manifest preview.
- **QrPanel**: rendered QR (SVG, local generation), copy link button with "Copied"
  transient state (1.6s), error state if clipboard denied: full link shown.
- **LedgerTable / Console**: header sticky; row hover; filter select states (default,
  focus ring, active filter chip); sort toggles (aria-sort); loading: skeleton-free —
  "Loading ledger…" pulse; empty state: designed ("Nothing in the ledger yet — seal a
  vault to start."); filtered-empty: "No rows match this filter — clear it." + action.
- **CTA Overlay**: modal surface; open: clip-path reveal from the button (below);
  focus trap start→end, Esc closes (focus returns to opener); backdrop click closes;
  three demo paths: SOLO (dominant), WITH A FRIEND, LIVE SANDBOX (small, ghost).

## 6. Motion spec (trigger → property → duration → easing → reduced-motion)

Two transition *types* per page, maximum. Named curves:
`--ease-out: cubic-bezier(.23,1,.32,1)`, `--ease-in-out: cubic-bezier(.77,0,.175,1)`.

| # | Trigger | Property | Dur | Ease | Reduced-motion |
| --- | --- | --- | --- | --- | --- |
| M1 | Page/section enter (IntersectionObserver, once) | opacity + translateY(12px)→0 | 480ms | M1-ease-out | opacity only, 160ms |
| M2 | State flip (SEALED→AUDITING→PAID), per section scroll & app routes | token crossfade + label swap (transform, opacity) | 260ms | M1-ease-out | instant swap, no movement |
| M3 | Nav → route (CTA → app) shared element: captured CTA rect → hero instrument | transform + clip-path, from captured rect | 520ms | M1-ease-in-out | crossfade 200ms only |
| M4 | CTA overlay open/close | clip-path inset + scale(0.96) | 260ms | M1-ease-out | opacity 160ms |
| M5 | Provenance/evidence rows append | opacity + translateY(8px) | 180ms | M1-ease-out | opacity only |
| M6 | Approve→capture progression (freeze bar fill) | clip-path inset right→0 | 900ms | linear | instant state change |
| M7 | Button press | transform scale .97 | 160ms | M1-ease-out | none (colour only) |

Never animate width/height; no keyframes on interruptible UI; hover gated behind
`(hover:hover) and (pointer:fine)`; everything ships with its reduce block.

## 7. Responsive breakpoints

`360 / 640 / 900 / 1180 / 1440`. Landing sections stack under 900; portal's manifest +
interrogation side-by-side ≥900, stacked below; console table ≥760 (else card list);
CTA overlay full-screen sheet at <640. All breakpoints type-checked in `responsive.spec.ts`.

## 8. Honesty rules (product copy)

Every simulated surface carries `Illustrative data` where Affinda does — and the sandbox
transaction carries its **real id and timestamp, visibly labelled `sandbox`**. Copy says
"held by your card's authorization", never "we hold your money". PayPal capture is
described as "capture on approval", 3-day honour-period alignment noted.

## 9. File tree

```
index.html  package.json  tsconfig.json  vite.config.ts  playwright.config.ts
docs/RESEARCH.md  docs/PLAN.md  docs/screens/<route>-<bp>.png
tests/cta-overlay.spec.ts  tests/client-portal.spec.ts  tests/responsive.spec.ts  tests/reduced-motion.spec.ts
src/styles/tokens.css          ← every hex, curve, duration, radius (single source)
src/styles/app.css             ← resets, typography, landing + app structural CSS (tokens only)
src/lib/money.ts               ← formatting (tabular, ids, timestamps, quantise)
src/lib/hash.ts                ← sha-256 via SubtleCrypto + fflate zip manifest
src/lib/seed.ts                ← seeded demo vault: real-feel ids, fixed txn sandbox
src/lib/store.tsx              ← lifecycle engine SEALED→…→PAID, webhooks, localStorage
src/lib/transitions.tsx        ← shared-element rect capture between CTA and app
src/components/icons.tsx       ← all SVG marks (lock, seal, scan, warn, check, download, qr)
src/components/StateToken.tsx  src/components/VerifierChip.tsx  src/components/ManifestRow.tsx
src/components/ProvenanceBlock.tsx  src/components/FreezeBar.tsx  src/components/AmountReadout.tsx
src/components/QrPanel.tsx     src/components/VaultButton.tsx
src/pages/Landing.tsx          ← sections in order: Problem, Freeze, Vault, Interrogation, Verdict, Handshake, Payoff+CTA
src/pages/landing/Overlay.tsx  ← the three demo paths (SOLO, WITH A FRIEND, LIVE SANDBOX)
src/pages/VaultNew.tsx  src/pages/VaultDetail.tsx  src/pages/ClientPortal.tsx  src/pages/ClientFiles.tsx
src/pages/Console.tsx  src/pages/Demo.tsx
src/main.tsx  src/App.tsx
```

## 10. Build order (vertical slice first)

1. Vite + React + TS scaffold; tokens.css; icons; money/hash/seed.
2. Store engine; landing → 7 sections + overlay (ugly is fine) — verify tsc + build.
3. App routes; console; demo. 4. Visual polish + validation loop (MCP screenshots,
console/network, a11y asserts, Playwright specs, traces). Full Playwright specs run via
`npx playwright test`; MCP used for screenshot/inspection; chrome-devtools MCP is
**not connected** (recorded honestly — Playwright's console/network observers carry that load).
