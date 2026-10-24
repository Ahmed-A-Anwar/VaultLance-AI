import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const URL = "http://127.0.0.1:5180/";
const OUT = "docs/hero-shots";
const WIDTHS = [375, 768, 1024, 1440, 1920];
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const results = { geometry: {}, entrance: null, cls: {}, shots: [] };

const observe = () => {
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
};

/* ---- geometry: reduced motion, so nothing is mid-animation ---- */
for (const width of WIDTHS) {
  const height = width >= 1440 ? 900 : width >= 1024 ? 768 : width === 768 ? 1024 : 812;
  const ctx = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.addInitScript(observe);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  results.geometry[width] = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const wheel = document.querySelector(".hero-wheel")?.getBoundingClientRect();
    return {
      viewport: { w: innerWidth, h: innerHeight },
      heroH: +document.querySelector(".hero-page").getBoundingClientRect().height.toFixed(1),
      wheelCenterPct: wheel
        ? {
            x: +(((wheel.left + wheel.width / 2) / innerWidth) * 100).toFixed(2),
            y: +(((wheel.top + wheel.height / 2) / innerHeight) * 100).toFixed(2),
          }
        : null,
      signup: box('[data-testid="hero-signup"]'),
      signin: box('[data-testid="hero-signin"]'),
      signupTopPct: +((box('[data-testid="hero-signup"]').y / innerHeight) * 100).toFixed(2),
      copy: box(".hero-copy"),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h1: (() => {
        const cs = getComputedStyle(document.querySelector(".hero-h1"));
        return { size: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing, family: cs.fontFamily };
      })(),
      cls: +window.__cls.toFixed(4),
    };
  });
  await page.screenshot({ path: `${OUT}/final-${width}.png` });
  await ctx.close();
}

/* ---- entrance + hover states: motion allowed ---- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.addInitScript(observe);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${OUT}/t0-1440.png` });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/t2618-1440.png` });

  results.entrance = await page.evaluate(() => ({
    chipsOpacity: getComputedStyle(document.querySelector(".hero-chips")).opacity,
    stageTransform: getComputedStyle(document.querySelector(".hero-stage-wrap")).transform,
    wheelRotation: getComputedStyle(document.querySelector(".hero-wheel")).transform,
  }));

  await page.hover('[data-testid="hero-signup"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/hover-signup-1440.png` });
  results.hoverSignup = await page.evaluate(() => ({
    wheel: getComputedStyle(document.querySelector(".hero-wheel")).transform,
    seam: document.querySelector(".hero-seam-svg path")?.getAttribute("stroke"),
    arrow: getComputedStyle(document.querySelector('[data-testid="hero-signup"] svg')).transform,
  }));

  await page.hover('[data-testid="hero-signin"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/hover-signin-1440.png` });
  results.hoverSignin = await page.evaluate(() => ({
    glow: getComputedStyle(document.querySelector(".hero-keypad-glow")).opacity,
    keys: [...document.querySelectorAll(".hero-keypad-key")].map((k) => getComputedStyle(k).opacity),
    connector: document.querySelector(".hero-connector path")?.getAttribute("d")?.slice(0, 40),
    border: getComputedStyle(document.querySelector('[data-testid="hero-signin"]')).borderColor,
  }));

  results.cls = await page.evaluate(() => +window.__cls.toFixed(4));
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
