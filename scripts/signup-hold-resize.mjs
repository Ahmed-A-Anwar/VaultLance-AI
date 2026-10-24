/* signup-hold-resize.mjs — the held frame belongs to the vault, not the viewport.

   On /signup: resize the window and the base canvas must repaint the landed
   frame at the new rect. A cold load of /signup has no turn behind it, so the
   resting photo is what it opens on. */

import { chromium } from "playwright";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const probe = () =>
  page.evaluate(async () => {
    const base = document.querySelector("canvas.hero-canvas");
    const rect = JSON.parse(document.querySelector(".hero-rect").dataset.rect);
    const ctx = base.getContext("2d");
    const dpr = base.width / base.parentElement.clientWidth;
    const box = {
      x: Math.round((rect.dx + rect.dw * 0.4) * dpr),
      y: Math.round((rect.dy + rect.dh * 0.36) * dpr),
      w: Math.round(rect.dw * 0.27 * dpr),
      h: Math.round(rect.dh * 0.28 * dpr),
    };
    const a = ctx.getImageData(box.x, box.y, box.w, box.h).data;
    const score = async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = base.width;
      c.height = base.height;
      const g = c.getContext("2d");
      g.drawImage(img, rect.dx * dpr, rect.dy * dpr, rect.dw * dpr, rect.dh * dpr);
      const b = g.getImageData(box.x, box.y, box.w, box.h).data;
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) {
        sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      }
      return +(sum / ((a.length / 4) * 3)).toFixed(2);
    };
    return {
      baseVsRest: await score("/vault-frames/f_001.webp"),
      baseVsLanded: await score("/wheel-turn/ezgif-frame-081.webp"),
      drawn: { w: Math.round(rect.dw), h: Math.round(rect.dh) },
    };
  });

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(16000);
await page.click('[data-testid="hero-signup"]');
await page.waitForFunction(() => location.pathname === "/signup", null, { timeout: 20000 });
await page.waitForTimeout(2400);
const atSignup = await probe();
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(800);
const resized = await probe();

/* cold load */
const cold = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await cold.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
await cold.waitForTimeout(1400);
const coldState = await cold.evaluate(() => {
  const clip = document.querySelector('[data-testid="wheel-clip"]');
  const card = document.querySelector(".signup-card");
  const base = document.querySelector("canvas.hero-canvas");
  return {
    clipOpacity: +getComputedStyle(clip).opacity,
    card: !!card && getComputedStyle(card).transform,
    basePainted: base.width > 0,
    rect: document.querySelector(".hero-rect").dataset.painted,
  };
});

console.log(
  JSON.stringify({ atSignup, resized, coldState, errors }, null, 2)
);
await browser.close();
