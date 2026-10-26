# VaultLance AI hero — design plan

## Subject
VaultLance AI landing hero: vault photography + goldenratio layout + entrance timeline.

## Color
- ink #0E1520
- slate #4B5663
- steel #8A95A1
- brass #B8893A
- brass-light #E2B867
- teal #12A5B5
- success #1F9D6B
- bg gradient sampled from frame (top -> bottom).

## Type
- Display/headline: Fraunces 600, optical auto, -0.02em, 1.05, clamp(42, 4.7vw, 68).
- Mono labels: JetBrains Mono 12px uppercase 0.14em.
- Body: Inter 400 16/1.618 max 44ch.
- Buttons: Inter 600 16px 0.01em.

## Layout
- Desktop: 38.2% text | 61.8% vault. Vault focal wheel center at 61.8% x, 50% y.
- Buttons row on 61.8% horizontal golden line from top.
- Tablet/mobile: vault first 100%, text below, buttons stacked full width.
- Text column left padding 89px on desktop; 21px on tablet/mobile.
- Vault overflow visible; soft shadow is part of the image — no extra shadow.

## Motion
- GSAP entrance timeline, durations from {0.236,0.382,0.618,1,1.618,2.618}.
- Idle loops: vault float 6.18s, teal glow 2.618s, shimmer 1.618s/6.18s, parallax lerp 0.08.
- Reduced motion: final state only.
- Button hover/tap reactions with vault hotspots; mobile uses tap not hover.

## Build steps
1. Sample frame colors and confirm hotspot positions.
2. Add fonts (Fraunces, JetBrains Mono, Inter) to index.html.
3. Build Hero.tsx + Hero.css.
4. Update Landing to render Hero above VaultSequence.
5. Wire GSAP entrance + idle loops.
6. Wire Sign up / Sign in reactions.
7. Verify.
