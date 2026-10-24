/* Probe 3: in-page rAF-driven scroll — does IO flush per step? */
import { chromium } from "playwright";

const browser = await chromium.launch();
for (const reduce of [false, true]) {
  const ctx = await browser.newContext({ reducedMotion: reduce ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForSelector(".reveal", { timeout: 10_000 });

  const step = () => page.evaluate(() => {
    const maxY = () => document.documentElement.scrollHeight - window.innerHeight;
    window.__rafY = (window.__rafY ?? 0) + 480;
    window.scrollTo(0, Math.min(window.__rafY, maxY()));
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      void document.body.offsetHeight; // force style/layout
      res(window.scrollY);
    })));
  });

  let last = 0;
  for (let i = 0; i < 16; i++) {
    const y = await step();
    if (y === last) break;
    last = y;
  }
  await page.waitForTimeout(500);
  const state = await page.evaluate(() =>
    [...document.querySelectorAll(".reveal")].map((el) => ({ at: el.dataset.at, top: Math.round(el.getBoundingClientRect().top + window.scrollY) }))
  );
  console.log(reduce ? "REDUCE " : "NORMAL ", JSON.stringify(state));
  await ctx.close();
}
await browser.close();
