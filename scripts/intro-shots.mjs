/* intro-shots.mjs — capture the first-visit intro at its three moments:
   keypad lit, wheel mid-turn, and the vault back at rest. */

import { chromium } from "playwright";
import fs from "node:fs";

const URL = "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/intro";
fs.mkdirSync(OUT, { recursive: true });

const opacity = (sel) =>
  `(() => { const el = document.querySelector('${sel}'); return el ? Number(el.style.opacity || 0) : 0; })()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "load" });

const waitFor = async (sel, min, timeout) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await page.evaluate(opacity(sel))) >= min) return true;
    await page.waitForTimeout(100);
  }
  return false;
};

const keypad = '[data-testid="keypad-clip"]';
const wheel = '[data-testid="wheel-clip"]';

const lit = await waitFor(keypad, 0.95, 15_000);
await page.waitForTimeout(1_700);
await page.screenshot({ path: `${OUT}/01-keypad-lit.png` });

const turning = await waitFor(wheel, 0.95, 15_000);
await page.waitForTimeout(1_100);
await page.screenshot({ path: `${OUT}/02-wheel-mid.png` });
await page.waitForTimeout(2_200);
await page.screenshot({ path: `${OUT}/03-wheel-open.png` });

/* wait for the intro to finish: the wheel fades back out */
const t0 = Date.now();
while (Date.now() - t0 < 20_000) {
  if ((await page.evaluate(opacity(wheel))) < 0.02) break;
  await page.waitForTimeout(200);
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/04-rest.png` });

console.log(`keypad lit: ${lit}, wheel turned: ${turning}`);

await browser.close();
