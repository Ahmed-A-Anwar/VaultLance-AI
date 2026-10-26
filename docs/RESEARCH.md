# VaultLance AI — research log

Date: 2026-10-23. Every search and failed source is recorded below.

## What could not be used (recorded honestly)

- **`ui-ux-pro-max` skill / CLI — NOT AVAILABLE.** It is not among the account skills
  synced into this client (frontend-design, extract-design-system, image-to-code,
  accessibility, performance, webapp-testing, verification-before-completion,
  git-commit, implement-design, figma-design-to-code, emil-design-eng, animate,
  review-animations, animation-vocabulary, pick-ui-library, find-animation-
  opportunities, improve-animations are). I did not invent a runnable `ui-ux-pro-max`
  search script. Compensated with: the `frontend-design`, `animate` and
  `emil-design-eng` SKILL.md craft guides, plus parallel web-research agents over
  style/color/typography/landing/UX framings of the idea (three framings:
  fintech escrow/audit design language; demo-before-signup UX; UI Vault inventory).
- **`chrome-devtools` MCP — NOT CONNECTED** in this client; `playwright` MCP is listed
  as available and is used for validation (verified at validation time). No `claude mcp add`
  was possible to hot-connect mid-session; restated in the final report.
- **UI Vault live page (https://en970.github.io/ui-vault/) — FETCH FAILED**: client-rendered,
  response exceeded the 2 MB read limit. Verified instead via its
  [GitHub repo](https://github.com/en970/ui-vault) README: 32 categories, 1,186+
  resources, all data in an inline `DATA` array inside `index.html` (~2.23 MB; GitHub
  refuses to render it). **I did not read all 1,186 records** — conclusions below are
  drawn from the README's category inventory plus independent verification of the
  named resources; specific-item presence in UI Vault is flagged "not confirmed".
- **PostHog `/demo` page — UNREADABLE** in page fetch (returned no readable text).
  PostHog's *homepage* demo labelling was verifiable ("Illustrative demo", "All
  findings are sample data").
- **Pylon interactive-demo library — DATA PROVENANCE UNVERIFIED**: no evidence their
  tours disclose seeded data; cross-checked against PostHog/Stripe honesty labelling.

## Named sources — mechanic taken / mechanic rejected

1. **Stripe** ([hold-on-payment docs](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method), [Elements](https://stripe.com/payments/elements)) — *Take:* authorization appears as **"Uncaptured"**; hold/capture are distinct states with explicit expiry. This is the entire semantic spine of section 2 ("money is HELD not captured"). Chrome: the brand. *Reject:* Stripe-fluent checkout UI kits and their example palette as brand look.
2. **PayPal** ([authorize & capture](https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture)) — *Take:* the real two-step reality: auth → hold → capture; 29-day authorization; capture fires only on approval; **custody caveat**: the customer's authorization is *not* money in our vault — copy says "held by your card", never "held by us". *Reject:* implying a fixed review window.
3. **Mercury** (homepage + ["designing in the open"](https://mercury.com/blog/designing-in-the-open)) — *Take:* **fully ungated public demo, no contact info, no gates** — the direct precedent for "never force a PayPal login to reach the demo". *Reject:* banking-product breadth and their locks-and-permissions page furniture.
4. **Column** (column.com) — *Take:* human-readable payment states ("Submitted", "Completed") sitting beside *inspectable* raw detail — the model for computing COMPUTED columns in `/console` while keeping the timeline plain. *Reject:* raw API payload as the primary experience.
5. **Monzo** ([brand refresh](https://monzo.com/blog/weve-had-a-little-makeover)) — *Take:* the explicit two-face pairing (character display face + quiet functional face) and "exaggerated UI" honesty — user-visible machine PII makes its point through composed UI, not decoration. *Reject:* one saturated brand color meaning a *state*; HPREAD `hot coral` as borrowed brand.
6. **Wise** ([Ragged Edge case study](https://raggededge.com/partnerships/wise)) — *Take:* a bespoke display face carrying real numbers (concrete fees, arrival estimates) rather than abstract claims — hero acts as a live instrument. *Reject:* confusing safeguarding with card authorization.
7. **Codat** + [Block Club case](https://blockclub.co/case-studies/codat) — *Take:* **simulated product surface before explanation**; a refresh "logo, colors, type" that reads institutional, not sassy. This justifies landing sections 3–6 staging one real transaction as the product itself. *Reject:* implying certifications we don't hold.
8. **Affinda** (affinda.com) — *Take:* the direct precedent of **"Passed 1 check / Needs judgement / Held for review"** — computed checks and judgment shown as two different things (whole basis of section 5), plus "**Illustrative data**" labelling. *Reject:* AI conclusions as confident binary pass/fail badges.
9. **Overstory** (overstory.com) — *Take:* "See the risk → Model the tradeoffs → Make the decision" narrative order → landing is interrogation → verdict → handshake, not feature grid. *Reject:* "AI reviewed = objective truth" tone.
10. **PostHog** (homepage) — *Take:* honesty labelling right at the point of use — every demo surface for VaultLance says this is seeded sandbox data with its transaction id. *Reject:* unlabelled fictional numbers anywhere (post-Research rule: never unlabeled invention).
11. **Stripe sandbox demo** ([test cards](https://docs.stripe.com/testing)) — *Take:* sandbox / test outcomes notion *explicitly contradicted by docs* — sandbox transactions don't move funds and test cards are fake. VaultLance's copy matches that exactly. *Reject:* implying sandbox ids appear in that marketing preview (couldn't verify, so I compute them myself).
12. **FigJam Open Sessions** ([help doc](https://help.figma.com/hc/en-us/articles/4410786053911-Invite-visitors-to-an-open-session)) — *Take:* the visitor-join pattern — with-a-friend demo uses two links + QR, participant includes a name/alias, access is temporary, explicit hesitation-free entry. *Reject:* using "guest account" anything (Linear's guest role is **sign-in-required** — explicit non-target).
13. **UI Vault repo** (above) — *Take:* the directory-level pointers only — **GSAP/Lenis/Motion confirmed in its Scroll & Animation category; Polaris/Carbon/Primer/Spectrum status-token docs (all four fetched during validation: color + label + icon never alone)**. *Take:* QR generation: used a local generator, not goQR (which records request origin/IP). *Not confirmed:* specific audit/terminal blocks in its catalog.

## What the craft skills imposed (read before building)

- **frontend-design**: avoid the cream-#F4F1EA + terracotta cliché, acid-green-on-black,
  broadsheet zero-radius hairlines, SaaS-card kit, ALL-CAPS eyebrows, "A · B · C",
  mono for small data labels by default, "→" on links. Structure must encode information.
- **animate / emil-design-eng**: frequency gate first; two page transition types max
  (design principle, user rule); never `scale(0)`; never `ease-in` for UI; explicit
  curves (cubic-bezier(0.23,1,0.32,1) strong ease-out for UI entrances; (0.77,0,0.175,1)
  on-screen); durations: press 100–160 ms, popover 125–200 ms, modal ≤300 ms, UI <300 ms;
  reduced motion ships with it; CSS transitions for interruptible; stagger 30–80 ms;
  `transform`/`opacity`/`clip-path` only.
