/* Probe 2: minimal IO reproduction + scroll position tracking. */
import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
await page.goto("http://127.0.0.1:5173/");
await page.waitForSelector(".reveal", { timeout: 10_000 });
await page.waitForTimeout(500);

await page.evaluate(() => {
  window.__ioEvents = [];
  const target = document.querySelectorAll(".reveal")[1]; // second section, below fold
  const io = new IntersectionObserver((es) => {
    window.__ioEvents.push(es.map((e) => ({ isInt: e.isIntersecting, ratio: +e.intersectionRatio.toFixed(2) })));
  }, { rootMargin: "-60px" });
  io.observe(target);
  const io2 = new IntersectionObserver((es) => {
    window.__ioEvents.push({ minimal: es.map((e) => e.isIntersecting) });
  });
  io2.observe(document.body);
});

const h = await page.evaluate(() => document.body.scrollHeight);
await page.mouse.move(640, 380);
for (let y = 0; y < h; y += 480) {
  await page.mouse.wheel(0, 480);
  await page.waitForTimeout(80);
  console.log("scrollY:", await page.evaluate(() => Math.round(window.scrollY)));
}
await page.waitForTimeout(800);
console.log("ioEvents:", JSON.stringify(await page.evaluate(() => window.__ioEvents)));
console.log("section2 data-at:", await page.evaluate(() => document.querySelectorAll(".reveal")[1].dataset.at));
await browser.close();
