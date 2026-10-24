/* mobile-keypad-rect.mjs — the keypad clip player is only created at 768px and
   up (see padViewport in HeroButtons), so a phone never builds one. To still
   test the rect it would draw with on a phone, build the player wide, resize
   down to the phone layout, then tap Sign in and compare its canvas with the
   static frame. Nothing on disk is changed; this is the browser only.

   usage: node scripts/mobile-keypad-rect.mjs <outDir> */

import { chromium } from "playwright";
import fs from "node:fs";

const outDir = process.argv[2] ?? "docs/hero-shots/mobile/clips";
const URL = "http://127.0.0.1:5173/";
fs.mkdirSync(outDir, { recursive: true });

const SIZES = [
  { name: "360x640", width: 360, height: 640 },
  { name: "390x844", width: 390, height: 844 },
];

const measure = () => {
  const dark = (canvas) => {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const d = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1, n = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (d[i + 3] < 8) continue;
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (l >= 150) continue;
        n++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    return { pixels: n, left: minX, top: minY, right: maxX, bottom: maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };
  const stage = document.querySelector(".hero-stage");
  return {
    vw: window.innerWidth,
    rect: document.querySelector(".hero-rect")?.dataset.rect ?? null,
    base: dark(stage.querySelector("canvas")),
    pad: dark(document.querySelector('[data-testid="keypad-clip"]')),
  };
};

const browser = await chromium.launch();
const report = [];

for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: 900, height: 1000 },
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const logs = [];
  page.on("console", (m) => logs.push(m.text()));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector('.hero-rect[data-painted="1"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(6000);

  await page.setViewportSize({ width: size.width, height: size.height });
  await page.waitForTimeout(1200);

  const before = await page.evaluate(measure);

  const el = page.locator('[data-testid="hero-signin"]');
  await el.scrollIntoViewIfNeeded();
  await el.tap({ force: true });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${size.name}-keypad-after-resize.png` });

  const after = await page.evaluate(measure);
  report.push({
    size: size.name,
    url: page.url(),
    keypadReady: logs.some((l) => l.includes("keypad clip:")),
    before,
    after,
    delta: after.pad && after.base
      ? {
          left: after.pad.left - after.base.left,
          top: after.pad.top - after.base.top,
          w: after.pad.w - after.base.w,
          h: after.pad.h - after.base.h,
        }
      : null,
  });
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
