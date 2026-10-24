/* signup-polish-edges.mjs — collisions and the breakpoints, plus the transition.

   1024/1100/1280/1440: rail right vs card left, card right vs the vault's first
   dark column. 1099/1100: which stepper is on. Then "/" -> "/signup": the vault
   lands at 76.4, the card is final, no ghosts, the clip canvas is empty. */

import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/signup/polish";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const rows = [];

for (const [W, H] of [[1024, 768], [1100, 800], [1280, 800], [1440, 900]]) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.click('[data-testid="role-freelancer"]');
  await page.waitForTimeout(1500);
  const geo = await page.evaluate(() => {
    const r = (s) => {
      const el = document.querySelector(s);
      if (!el || getComputedStyle(el).display === "none") return null;
      const b = el.getBoundingClientRect();
      return { x: +b.left.toFixed(1), right: +b.right.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), w: +b.width.toFixed(1) };
    };
    const s = document.querySelector(".stepper");
    return {
      card: r(".signup-card"),
      rail: r(".signup-rail"),
      stepper: s ? { w: +s.getBoundingClientRect().width.toFixed(1), h: +s.getBoundingClientRect().height.toFixed(1) } : null,
      compact: r(".stepper-compact-row"),
      railOn: getComputedStyle(document.querySelector(".signup-rail")).display !== "none",
      compactOn: getComputedStyle(document.querySelector(".signup-stepper-compact")).display !== "none",
      cardTop: +document.querySelector(".signup-card").getBoundingClientRect().top.toFixed(1),
      cardBottom: +document.querySelector(".signup-card").getBoundingClientRect().bottom.toFixed(1),
    };
  });
  const file = `${OUT}/edge-${W}.png`;
  await page.screenshot({ path: file });
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  let vaultLeft = null;
  for (let x = Math.round(geo.card.right) + 2; x < info.width; x++) {
    let hits = 0;
    for (let y = 0; y < info.height; y += 4) if (data[(y * info.width + x) * info.channels] < 120) hits++;
    if (hits > 12) { vaultLeft = x; break; }
  }
  fs.rmSync(file);
  rows.push({
    W,
    ...geo,
    vaultLeft,
    railToCard: geo.rail ? +(geo.card.x - geo.rail.right).toFixed(1) : null,
    cardToVault: vaultLeft !== null ? vaultLeft - geo.card.right : null,
    vaultX: await page.evaluate(() => getComputedStyle(document.querySelector(".vault-shift")).getPropertyValue("--vault-x").trim()),
  });
  await page.close();
}

/* exact breakpoint */
const bp = {};
for (const W of [1099, 1100]) {
  const page = await browser.newPage({ viewport: { width: W, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  bp[W] = await page.evaluate(() => ({
    rail: getComputedStyle(document.querySelector(".signup-rail")).display,
    compact: getComputedStyle(document.querySelector(".signup-stepper-compact")).display,
  }));
  await page.close();
}

/* the hero transition, unchanged */
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(16000);
await page.hover('[data-testid="hero-signup"]');
await page.waitForTimeout(1200);
const hired = await page.evaluate(() => +getComputedStyle(document.querySelector('[data-testid="wheel-clip"]')).opacity);
await page.click('[data-testid="hero-signup"]');
await page.waitForFunction(() => location.pathname === "/signup", null, { timeout: 20000 });
await page.waitForTimeout(2000);
const after = await page.evaluate(() => {
  const card = document.querySelector(".signup-card");
  const clip = document.querySelector('[data-testid="wheel-clip"]');
  const d = clip.getContext("2d").getImageData(0, 0, clip.width, clip.height).data;
  let solid = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) solid++;
  return {
    vaultX: getComputedStyle(document.querySelector(".vault-shift")).getPropertyValue("--vault-x").trim(),
    cardOpacity: +getComputedStyle(card).opacity,
    cardTransform: getComputedStyle(card).transform,
    ghosts: document.querySelectorAll(".scene-ghost").length,
    clipSolid: solid,
    cardH: +card.getBoundingClientRect().height.toFixed(1),
    focus: document.activeElement?.id ?? null,
  };
});

console.log(JSON.stringify({ rows, bp, transition: { hired, after }, errors }, null, 2));
await browser.close();
