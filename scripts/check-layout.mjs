import { chromium } from "@playwright/test";
const b = await chromium.launch();
const out = {};
for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080], [375, 812], [768, 1024]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  await p.goto("http://127.0.0.1:5180/", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  out[w] = await p.evaluate(() => {
    const r = (s) => { const el = document.querySelector(s); const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) }; };
    return { body: r(".hero-body"), cta: r(".hero-cta-block"), signup: r('[data-testid="hero-signup"]'), signin: r('[data-testid="hero-signin"]'), h1: r(".hero-h1"), overlap: +(r(".hero-body").bottom - r(".hero-cta-block").top).toFixed(1), overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, lineup: [...document.querySelectorAll(".word")].map(e => e.getBoundingClientRect().top | 0) };
  });
  await p.close();
}
await b.close();
console.log(JSON.stringify(out, null, 1));
