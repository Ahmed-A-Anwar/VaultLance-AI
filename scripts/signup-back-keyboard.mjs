/* signup-back-keyboard.mjs — the back link on a cold /signup: it is the first
   control inside the page, takes the teal focus ring, and Enter leaves for "/". */

import { chromium } from "playwright";
import sharp from "sharp";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const stop = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName,
      text: el?.textContent?.trim().slice(0, 30),
      testid: el?.getAttribute("data-testid"),
      outline: el ? `${getComputedStyle(el).outlineWidth} ${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).outlineColor}` : null,
    };
  });

const stops = [];
for (let i = 0; i < 3; i++) {
  await page.keyboard.press("Tab");
  stops.push(await stop());
}

/* back to the link, screenshot the ring, then Enter */
await page.focus('[data-testid="signup-back"]');
await page.waitForTimeout(120);
const png = await page.screenshot({ clip: { x: 240, y: 240, width: 620, height: 480 } });
await sharp(png).jpeg({ quality: 90 }).toFile("docs/hero-shots/signup/_preview/back-focus.jpg");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
const after = await page.evaluate(() => location.pathname);

console.log(JSON.stringify({ stops, after }, null, 2));
await browser.close();
