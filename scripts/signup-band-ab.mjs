/* signup-band-ab.mjs — the pale band, before and after.

   Before is the old mask (12% of the canvas width), applied at runtime to the
   same build; after is the shipped 144px fade that starts at the drawn image's
   edge. Both are measured for the largest single column step in the left third. */

import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/signup/polish";
fs.mkdirSync(OUT, { recursive: true });

const OLD_MASK = `.hero-canvas {
  mask-image:
    linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%),
    linear-gradient(to bottom, transparent 0%, #000 7%, #000 93%, transparent 100%) !important;
  -webkit-mask-composite: source-in;
}`;

const browser = await chromium.launch();
const out = {};

for (const [W, H] of [[1440, 900], [1920, 1080]]) {
  for (const mode of ["before", "after"]) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    if (mode === "before") await page.addStyleTag({ content: OLD_MASK });
    await page.waitForTimeout(300);
    const png = `${OUT}/band-${mode}-${W}.png`;
    await page.screenshot({ path: png });
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    /* a band clear of the wordmark (y 55..104) and of the card (x 323+) */
    const y0 = 300;
    const y1 = 380;
    const col = [];
    const span = Math.round(Math.min(W * 0.34, W * 0.382 - 226.5 - 20));
    for (let x = 0; x < span; x++) {
      let s = 0;
      for (let y = y0; y < y1; y++) s += data[(y * info.width + x) * ch];
      col.push(s / (y1 - y0));
    }
    const smooth = col.map((_, i) => {
      const a = Math.max(0, i - 4), z = Math.min(col.length - 1, i + 4);
      let s = 0;
      for (let k = a; k <= z; k++) s += col[k];
      return s / (z - a + 1);
    });
    let best = { d: 0, x: 0 };
    for (let x = 6; x < smooth.length; x++) {
      const d = smooth[x] - smooth[x - 6];
      if (Math.abs(d) > Math.abs(best.d)) best = { d: +d.toFixed(2), x };
    }
    out[`${mode}-${W}`] = best;
    await page.close();
  }
}

/* the crop that shows it */
for (const [mode, W] of [["before", 1440], ["after", 1440]]) {
  await sharp(`${OUT}/band-${mode}-${W}.png`)
    .extract({ left: 0, top: 0, width: Math.round(W * 0.45), height: 300 })
    .resize(900)
    .jpeg({ quality: 88 })
    .toFile(`${OUT}/band-${mode}-crop.jpg`);
}

console.log(JSON.stringify(out, null, 2));
await browser.close();
