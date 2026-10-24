/* signup-wheel-hold.mjs — the landed wheel, measured in the page's own clock.

   click Sign up on a settled hero, then report: when the clip's last frame
   became the base canvas, when the route changed, and what the /signup vault is
   painted with. Then back: f_001 restored, seam overlay usable again. */

import { chromium } from "playwright";
import fs from "node:fs";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/signup/_preview";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(URL, { waitUntil: "networkidle" });
/* the entrance demo has to be over before the pointer goes anywhere near it */
await page.waitForTimeout(16000);

const probe = () =>
  page.evaluate(async () => {
    const base = document.querySelector("canvas.hero-canvas");
    const clip = document.querySelector('[data-testid="wheel-clip"]');
    const rect = JSON.parse(document.querySelector(".hero-rect").dataset.rect);
    const ctx = base.getContext("2d");
    const dpr = base.width / base.parentElement.clientWidth;
    const box = {
      x: Math.round((rect.dx + rect.dw * 0.4) * dpr),
      y: Math.round((rect.dy + rect.dh * 0.36) * dpr),
      w: Math.round(rect.dw * 0.27 * dpr),
      h: Math.round(rect.dh * 0.28 * dpr),
    };
    const a = ctx.getImageData(box.x, box.y, box.w, box.h).data;
    const score = async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = base.width;
      c.height = base.height;
      const g = c.getContext("2d");
      g.drawImage(img, rect.dx * dpr, rect.dy * dpr, rect.dw * dpr, rect.dh * dpr);
      const b = g.getImageData(box.x, box.y, box.w, box.h).data;
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) {
        sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      }
      return +(sum / ((a.length / 4) * 3)).toFixed(2);
    };
    const d = clip.getContext("2d").getImageData(0, 0, clip.width, clip.height).data;
    let solid = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) solid++;
    return {
      baseVsRest: await score("/vault-frames/f_001.webp"),
      baseVsLanded: await score("/wheel-turn/ezgif-frame-081.webp"),
      clipSolid: solid,
      clipOpacity: +getComputedStyle(clip).opacity,
      vaultX: getComputedStyle(document.querySelector(".vault-shift")).getPropertyValue("--vault-x").trim(),
      path: location.pathname,
    };
  });

const out = { atRest: await probe() };

/* page-side stopwatch: the click event -> the first frame on /signup */
await page.evaluate(() => {
  const t = (window.__t = { click: 0, nav: 0 });
  document
    .querySelector('[data-testid="hero-signup"]')
    .addEventListener("click", () => (t.click = performance.now()), true);
  const tick = () => {
    if (!t.nav && location.pathname === "/signup") t.nav = performance.now();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const shots = [];
const shoot = async (name) => {
  const f = `${OUT}/${name}.png`;
  await page.screenshot({ path: f, clip: { x: 660, y: 100, width: 780, height: 700 } });
  shots.push(f);
};

const t0 = Date.now();
await page.click('[data-testid="hero-signup"]');
await page.waitForTimeout(900);
await shoot("wheel-t0900");
await page.waitForTimeout(1300);
await shoot("wheel-t2200");
const midDelay = Date.now() - t0;
await page.waitForFunction(() => location.pathname === "/signup", null, { timeout: 20000 });
const wallNav = Date.now() - t0;
await shoot("wheel-after-nav");
await page.waitForTimeout(700);
await shoot("wheel-nav+700");
await page.waitForTimeout(1200);
await shoot("wheel-nav+1900");
out.midAt = midDelay;
out.wallNav = wallNav;
out.clock = await page.evaluate(() => window.__t);
out.signup = await probe();

/* ---- back ---- */
await page.goBack();
await page.waitForTimeout(1400);
out.back = await probe();
out.seam = await page.evaluate(() => {
  const seam = document.querySelector(".hero-seam-svg path");
  return { visibility: getComputedStyle(seam).visibility, stroke: getComputedStyle(seam).stroke };
});
out.sameCanvas = await page.evaluate(
  () => document.querySelector(".hero-canvas") === window.__vaultCanvas
);
out.shots = shots;
out.errors = errors;
console.log(JSON.stringify(out, null, 2));
await browser.close();
