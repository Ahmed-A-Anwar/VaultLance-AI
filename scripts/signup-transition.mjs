/* signup-transition.mjs — walk the hero -> /signup transition at 1440×900 and
   capture one frame per run so the sampling times stay honest.

   Reports: navigation time, --vault-x, the vault transform at the end, whether
   the vault canvas survived (mounted once), the card rect, and the horizontal
   centre of the drawn vault body measured from pixels. */

import { chromium } from "playwright";
import fs from "node:fs";
import sharp from "sharp";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/signup";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
fs.mkdirSync(OUT, { recursive: true });

const FRAMES = [
  { t: 0, name: "t0" },
  { t: 600, name: "t600" },
  { t: 1200, name: "t1200" },
  { t: 2000, name: "t2000" },
  { t: 2900, name: "end" },
];

const browser = await chromium.launch();
const results = [];

for (const frame of FRAMES) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: "networkidle" });
  // let the entrance settle (idle float starts at 2.618s)
  await page.waitForTimeout(3600);
  await page.evaluate(() => {
    const c = window.__vaultCanvas;
    if (c) c.__mark = "kept";
    window.__mounted = (window.__mounted ?? 0) + 1;
  });

  await page.click('[data-testid="hero-signup"]');

  const started = Date.now();
  await page
    .waitForFunction(() => location.pathname === "/signup", null, { timeout: 8000 })
    .catch(() => {});
  const navMs = Date.now() - started;

  if (frame.t) await page.waitForTimeout(frame.t);
  await page.screenshot({ path: `${OUT}/${W}-${frame.name}.png` });

  const state = await page.evaluate(() => {
    const shift = document.querySelector(".vault-shift");
    const card = document.querySelector(".signup-card");
    const canvas = document.querySelector(".hero-canvas");
    const cs = shift ? getComputedStyle(shift) : null;
    const r = (el) => (el ? el.getBoundingClientRect().toJSON() : null);
    return {
      path: location.pathname,
      vaultX: cs?.getPropertyValue("--vault-x").trim() ?? null,
      shiftTransform: cs?.transform ?? null,
      card: r(card),
      cardOpacity: card ? getComputedStyle(card).opacity : null,
      cardTransform: card ? getComputedStyle(card).transform : null,
      canvasKept: canvas?.__mark === "kept",
      ghosts: document.querySelectorAll(".scene-ghost").length,
      heroCopy: !!document.querySelector(".hero-copy"),
      docWidth: document.documentElement.scrollWidth,
    };
  });

  results.push({ t: frame.t, navMs, ...state });
  await page.close();
}

/* the drawn wheel: dark pixels in the final frame, as a share of the width */
async function darkCentroid(file) {
  const { data, info } = await sharp(file)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, maxX = -1, minY = height, maxY = -1, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = data[(y * width + x) * channels];
      if (v < 120) {
        n++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { n, minX, maxX, minY, maxY, cx: ((minX + maxX) / 2 / width) * 100, width, height };
}

const last = `${OUT}/${W}-end.png`;
const px = await darkCentroid(last);
const at0 = await darkCentroid(`${OUT}/${W}-t0.png`);

console.log(JSON.stringify({ results, final: px, t0: at0 }, null, 2));
await browser.close();
