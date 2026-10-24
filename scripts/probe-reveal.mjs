/* Probe: does IO fire under prefers-reduced-motion with wheel scrolling? */
import { chromium } from "playwright";

const browser = await chromium.launch();
for (const reduce of [false, true]) {
  const ctx = await browser.newContext({ reducedMotion: reduce ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.mouse.move(640, 380);
  for (let y = 0; y < h; y += 480) {
    await page.mouse.wheel(0, 480);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(900);
  const state = await page.evaluate(() =>
    [...document.querySelectorAll(".reveal")].map((el) => {
      const s = getComputedStyle(el);
      return { at: el.dataset.at, op: s.opacity, top: Math.round(el.getBoundingClientRect().top + window.scrollY) };
    })
  );
  console.log(reduce ? "REDUCE" : "NORMAL", JSON.stringify(state));
  await ctx.close();
}
await browser.close();
