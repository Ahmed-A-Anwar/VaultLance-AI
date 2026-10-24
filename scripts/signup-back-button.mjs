/* signup-back-button.mjs — the card's way home.

   From the hero: the link exists, is the first tab stop, and clicking it runs the
   reverse transition (vault 76.4 -> 61.8 over 1s) and restores f_001.
   Cold load: Tab reaches it first and Enter leaves for "/". */

import { chromium } from "playwright";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(16000);

const box = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="signup-back"]');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      text: el.textContent.trim(),
      tag: el.tagName,
      href: el.getAttribute("href"),
      left: +b.left.toFixed(1),
      top: +b.top.toFixed(1),
      w: +b.width.toFixed(1),
      h: +b.height.toFixed(1),
    };
  });

await page.click('[data-testid="hero-signup"]');
await page.waitForFunction(() => location.pathname === "/signup", null, { timeout: 20000 });
await page.waitForTimeout(2600);
const link = await box();
const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);

/* the reverse transition: sample the anchor, then the settled state */
const t0 = Date.now();
await page.click('[data-testid="signup-back"]');
await page.waitForFunction(() => location.pathname === "/", null, { timeout: 10000 });
await page.waitForTimeout(240);
const mid = await page.evaluate(() => ({
  path: location.pathname,
  vaultX: +getComputedStyle(document.querySelector(".vault-shift")).getPropertyValue("--vault-x"),
  ghosts: document.querySelectorAll(".scene-ghost").length,
}));
await page.waitForTimeout(1600);
const end = await page.evaluate(() => ({
  path: location.pathname,
  vaultX: getComputedStyle(document.querySelector(".vault-shift")).getPropertyValue("--vault-x").trim(),
  card: !!document.querySelector(".signup-card"),
  ghosts: document.querySelectorAll(".scene-ghost").length,
  heroCopy: +getComputedStyle(document.querySelector(".hero-copy")).opacity,
}));

/* cold load: keyboard only */
const cold = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await cold.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
await cold.waitForTimeout(900);
await cold.keyboard.press("Tab");
const first = await cold.evaluate(() => ({
  text: document.activeElement?.textContent?.trim(),
  testid: document.activeElement?.getAttribute("data-testid"),
  outline: getComputedStyle(document.activeElement).outlineWidth,
}));
await cold.keyboard.press("Enter");
await cold.waitForTimeout(400);
const coldAfter = await cold.evaluate(() => location.pathname);

/* phone */
const phone = await browser.newPage({ viewport: { width: 440, height: 950 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await phone.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
await phone.waitForTimeout(900);
const phoneBox = await phone.evaluate(() => {
  const el = document.querySelector('[data-testid="signup-back"]');
  const card = document.querySelector(".signup-card").getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return {
    top: +b.top.toFixed(1),
    cardTop: +card.top.toFixed(1),
    inset: +(b.left - card.left).toFixed(1),
    scrolled: document.documentElement.scrollWidth,
  };
});

console.log(JSON.stringify({ link, focused, mid, end, first, coldAfter, phoneBox, errors }, null, 2));
await page.screenshot({ path: "docs/hero-shots/signup/_preview/back-mid.png", clip: { x: 240, y: 180, width: 620, height: 520 } });
await browser.close();
