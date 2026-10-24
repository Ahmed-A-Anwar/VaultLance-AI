/* iphone-shots.mjs — capture the landing on an iPhone 18 Pro Max
   (440 × 956 CSS px, DPR 3) and report the hero geometry at that size. */

import { chromium } from "playwright";
import fs from "node:fs";

const URL = "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/iphone-18-pro-max";
fs.mkdirSync(OUT, { recursive: true });

const DEVICE = {
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

const browser = await chromium.launch();

const geometry = (page) =>
  page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const vh = window.innerHeight;
    const up = box('[data-testid="hero-signup"]');
    return {
      viewport: `${window.innerWidth}x${vh}`,
      dpr: window.devicePixelRatio,
      docWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      stage: box(".hero-stage-wrap"),
      eyebrow: box(".hero-eyebrow"),
      h1: box(".hero-h1"),
      signup: up && { ...up, topPct: +((up.top / vh) * 100).toFixed(1) },
      signin: box('[data-testid="hero-signin"]'),
      note: box(".hero-micro"),
      body: box(".hero-body"),
      chips: box(".hero-chips"),
      chipsScroll: (() => {
        const el = document.querySelector(".hero-chips");
        return el ? { client: el.clientWidth, scroll: el.scrollWidth } : null;
      })(),
    };
  });

/* ---------- 1. the settled page ---------- */
const ctx = await browser.newContext(DEVICE);
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "load" });
await page.waitForTimeout(16_000);
await page.screenshot({ path: `${OUT}/01-first-screen.png` });
const g = await geometry(page);
console.log(JSON.stringify(g, null, 2));

await page.evaluate(() => window.scrollTo(0, document.querySelector(".hero-copy")?.offsetTop ?? 0));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/02-scrolled-cta.png` });

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-bottom.png` });
await ctx.close();

/* ---------- 2. mid-intro, wheel turning ---------- */
const ctx2 = await browser.newContext(DEVICE);
const p2 = await ctx2.newPage();
await p2.goto(URL, { waitUntil: "load" });
const wheel = await p2.waitForFunction(
  () => {
    const c = document.querySelector('[data-testid="wheel-clip"]');
    return c && Number(c.style.opacity || 0) > 0.9;
  },
  null,
  { timeout: 20_000 }
);
await p2.waitForTimeout(1_200);
await p2.screenshot({ path: `${OUT}/04-intro-wheel.png` });
console.log("wheel clip appeared:", Boolean(wheel));
await ctx2.close();

await browser.close();
