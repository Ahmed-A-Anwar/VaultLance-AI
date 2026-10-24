/* mobile-clips.mjs — on phone widths, run both clips by tapping and check that
   the clip canvas paints the vault over the same box as the static frame.

   usage: node scripts/mobile-clips.mjs <outDir> */

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
    const dpr = canvas.width / canvas.clientWidth;
    return {
      pixels: n,
      left: +(minX / dpr).toFixed(1),
      top: +(minY / dpr).toFixed(1),
      right: +(maxX / dpr).toFixed(1),
      bottom: +(maxY / dpr).toFixed(1),
      w: +((maxX - minX + 1) / dpr).toFixed(1),
      h: +((maxY - minY + 1) / dpr).toFixed(1),
    };
  };
  const base = document.querySelector('[data-testid="hero-signup"]').closest(".hero-page").querySelector(".hero-stage > canvas");
  const wheel = document.querySelector('[data-testid="wheel-clip"]');
  const pad = document.querySelector('[data-testid="keypad-clip"]');
  return {
    rect: document.querySelector(".hero-rect")?.dataset.rect ?? null,
    canvas: { css: [base.clientWidth, base.clientHeight], px: [base.width, base.height] },
    base: dark(base),
    wheel: dark(wheel),
    pad: dark(pad),
  };
};

const browser = await chromium.launch();
const report = [];

for (const size of SIZES) {
  /* hasTouch without isMobile: the page has no viewport meta, so isMobile would
     lay the document out at 980px and never reach the phone branch */
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    hasTouch: true,
  });

  for (const which of ["signup", "signin"]) {
    const page = await context.newPage();
    /* touch emulation flips (hover: none)/(pointer: coarse) so the tap path runs */
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForSelector('.hero-rect[data-painted="1"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4200);

    const before = await page.evaluate(measure);
    const pointer = await page.evaluate(() => ({
      fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
      coarse: matchMedia("(pointer: coarse)").matches,
    }));

    /* first tap arms and plays the clip, so one tap is enough to see it */
    const target = page.locator(`[data-testid="hero-${which}"]`);
    await target.scrollIntoViewIfNeeded();
    await target.tap({ force: true });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${outDir}/${size.name}-${which}-tap.png` });
    const after = await page.evaluate(measure);

    const clip = which === "signup" ? after.wheel : after.pad;
    report.push({
      size: size.name,
      which,
      url: page.url(),
      pointer,
      beforeBase: before.base,
      clip,
      delta: clip && after.base
        ? {
            left: +(clip.left - after.base.left).toFixed(1),
            top: +(clip.top - after.base.top).toFixed(1),
            w: +(clip.w - after.base.w).toFixed(1),
            h: +(clip.h - after.base.h).toFixed(1),
          }
        : null,
    });
    await page.close();
  }
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
