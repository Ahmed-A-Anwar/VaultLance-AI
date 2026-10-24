/* signup-quick-click.mjs — the common path: the pointer rests on Sign up, the
   hover turn lands, then the click. Navigation must be immediate, the landed
   frame must still be the /signup vault, and a second pass (back, then click
   again) must behave the same. */

import { chromium } from "playwright";

const URL = process.env.URL ?? "http://127.0.0.1:4183/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(16000);

const score = () =>
  page.evaluate(async () => {
    const base = document.querySelector("canvas.hero-canvas");
    const rect = JSON.parse(document.querySelector(".hero-rect").dataset.rect);
    const dpr = base.width / base.parentElement.clientWidth;
    const box = {
      x: Math.round((rect.dx + rect.dw * 0.4) * dpr),
      y: Math.round((rect.dy + rect.dh * 0.36) * dpr),
      w: Math.round(rect.dw * 0.27 * dpr),
      h: Math.round(rect.dh * 0.28 * dpr),
    };
    const a = base.getContext("2d").getImageData(box.x, box.y, box.w, box.h).data;
    const against = async (url) => {
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
    return { rest: await against("/vault-frames/f_001.webp"), landed: await against("/wheel-turn/ezgif-frame-081.webp") };
  });

const out = {};

for (const pass of [1, 2]) {
  if (pass === 2) {
    await page.goBack();
    await page.waitForTimeout(1800);
  }
  await page.hover('[data-testid="hero-signup"]');
  /* the hover turn runs the whole clip */
  await page.waitForTimeout(5200);
  const t0 = Date.now();
  await page.click('[data-testid="hero-signup"]');
  await page.waitForFunction(() => location.pathname === "/signup", null, { timeout: 15000 });
  const clickToNav = Date.now() - t0;
  await page.waitForTimeout(2000);
  out[`pass${pass}`] = { clickToNav, vault: await score() };
}

console.log(JSON.stringify(out, null, 2));
await browser.close();
