/* signup-edges.mjs — find the hard edges: the vertical pale band left of the
   vault and any horizontal strips at the bottom of the page. Prints the x/y
   where a column or row mean steps, plus the geometry that explains it. */

import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/signup/_preview";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const report = {};

for (const [W, H] of [[1280, 720], [1440, 900], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const geo = await page.evaluate(() => {
    const stage = document.querySelector(".hero-stage");
    const canvas = document.querySelector(".hero-canvas");
    const rect = document.querySelector(".hero-rect");
    const s = stage.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    const d = JSON.parse(rect.dataset.rect);
    const cs = getComputedStyle(canvas);
    return {
      stage: { w: s.width, h: s.height, x: s.left, y: s.top },
      canvas: { w: c.width, h: c.height, x: c.left, y: c.top },
      drawn: { dx: +d.dx.toFixed(1), dy: +d.dy.toFixed(1), dw: +d.dw.toFixed(1), dh: +d.dh.toFixed(1) },
      mask: cs.maskImage,
      doc: { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight },
      page: (() => {
        const p = document.querySelector(".hero-page").getBoundingClientRect();
        return { w: p.width, h: p.height, top: p.top };
      })(),
    };
  });

  const file = `${OUT}/edge-${W}.png`;
  const png = await page.screenshot({ path: file });
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  /* column means over a band that only contains background + canvas */
  const colMeans = [];
  for (let x = 0; x < info.width; x++) {
    let sum = 0;
    for (let y = Math.round(info.height * 0.15); y < Math.round(info.height * 0.25); y++) {
      sum += data[(y * info.width + x) * ch];
    }
    colMeans.push(sum / (info.height * 0.1));
  }
  const colSteps = [];
  for (let x = 2; x < colMeans.length; x++) {
    const d = colMeans[x] - colMeans[x - 2];
    if (Math.abs(d) > 1.2) colSteps.push({ x, delta: +d.toFixed(2), mean: +colMeans[x].toFixed(1) });
  }

  /* row means in the left third, clear of the card and the vault */
  const rowMeans = [];
  for (let y = 0; y < info.height; y++) {
    let sum = 0;
    for (let x = 0; x < Math.round(info.width * 0.18); x++) sum += data[(y * info.width + x) * ch];
    rowMeans.push(sum / Math.round(info.width * 0.18));
  }
  const rowSteps = [];
  for (let y = 2; y < rowMeans.length; y++) {
    const d = rowMeans[y] - rowMeans[y - 2];
    if (Math.abs(d) > 1.2) rowSteps.push({ y, delta: +d.toFixed(2) });
  }

  report[`${W}x${H}`] = {
    geo,
    colSteps: colSteps.slice(0, 24),
    rowSteps: rowSteps.slice(0, 16),
    colMeanAt: [0, 100, Math.round(W * 0.12), Math.round(W * 0.23), Math.round(W * 0.3), Math.round(W * 0.38)].map((x) => [x, +colMeans[x].toFixed(1)]),
  };
  await page.close();
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
