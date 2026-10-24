import { chromium } from "@playwright/test";

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await p.goto("http://127.0.0.1:5180/", { waitUntil: "networkidle" });
await p.waitForTimeout(500);

const info = await p.evaluate(() => {
  const btn = document.querySelector('[data-testid="hero-signup"]');
  const r = btn.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const stack = document
    .elementsFromPoint(cx, cy)
    .slice(0, 6)
    .map((e) => `${e.tagName}.${String(e.className).slice(0, 28)}`);
  const copy = document.querySelector(".hero-copy");
  const cs = getComputedStyle(copy);
  return {
    rect: { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    stack,
    copy: { pe: cs.pointerEvents, z: cs.zIndex, pos: cs.position, tf: cs.transform, opacity: cs.opacity },
  };
});

console.log(JSON.stringify(info, null, 1));
await b.close();
