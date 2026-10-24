/* signup-verify.mjs — the acceptance run for /signup.

   For each width: walk the hero -> /signup transition, then measure the card,
   the drawn vault (from pixels) and the gap between them, plus CLS and
   overflow-x. Then the reduced-motion pass: no timeline, final state at once. */

import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/signup";
fs.mkdirSync(OUT, { recursive: true });

const CLS_PROBE = `window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });`;

const browser = await chromium.launch();
const rows = [];

for (const W of [1024, 1280, 1440, 1920]) {
  const H = W >= 1440 ? 900 : 800;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.addInitScript(CLS_PROBE);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(3600);
  await page.evaluate(() => {
    const c = document.querySelector(".hero-canvas");
    if (c) c.__mark = "kept";
  });
  await page.click('[data-testid="hero-signup"]');
  await page.waitForFunction(() => location.pathname === "/signup");
  await page.waitForTimeout(2400);
  const geo = await page.evaluate(() => {
    const r = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: +b.left.toFixed(1), right: +b.right.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) };
    };
    return {
      card: r(".signup-card"),
      vaultX: getComputedStyle(document.querySelector(".vault-shift")).getPropertyValue("--vault-x").trim(),
      kept: document.querySelector(".hero-canvas")?.__mark === "kept",
      cls: window.__cls,
      docWidth: document.documentElement.scrollWidth,
      ghosts: document.querySelectorAll(".scene-ghost").length,
    };
  });
  const file = `${OUT}/verify-${W}.png`;
  await page.screenshot({ path: file });

  /* the vault's left edge: dark pixels to the right of the card */
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  let left = null;
  const from = Math.round(geo.card.right) + 2;
  for (let x = from; x < info.width; x++) {
    let hits = 0;
    for (let y = 0; y < info.height; y += 4) {
      if (data[(y * info.width + x) * info.channels] < 120) hits++;
    }
    if (hits > 12) { left = x; break; }
  }

  rows.push({ W, ...geo, vaultLeft: left, gap: left - geo.card.right });
  await page.close();
}

/* reduced motion */
const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await rm.goto(URL, { waitUntil: "networkidle" });
await rm.waitForTimeout(600);
await rm.click('[data-testid="hero-signup"]');
await rm.waitForTimeout(160);
const reducedState = await rm.evaluate(() => {
  const card = document.querySelector(".signup-card");
  return {
    path: location.pathname,
    card: !!card,
    opacity: card && getComputedStyle(card).opacity,
    transform: card && getComputedStyle(card).transform,
    ghosts: document.querySelectorAll(".scene-ghost").length,
    vaultX: getComputedStyle(document.querySelector(".vault-shift")).getPropertyValue("--vault-x").trim(),
  };
});

/* reduced motion on the way back */
await rm.goBack();
await rm.waitForTimeout(160);
const reducedBack = await rm.evaluate(() => ({
  path: location.pathname,
  vaultX: getComputedStyle(document.querySelector(".vault-shift")).getPropertyValue("--vault-x").trim(),
  card: !!document.querySelector(".signup-card"),
  ghost: document.querySelectorAll(".scene-ghost").length,
}));

console.log(JSON.stringify({ rows, reducedState, reducedBack }, null, 2));
await browser.close();
