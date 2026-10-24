/* hero-shots.mjs — capture the hero at the test widths and report geometry.
   usage: node scripts/hero-shots.mjs <outDir> [static]

   static = prefers-reduced-motion: reduce, which pins the entrance and the idle
   float, so two runs of the same code are pixel-identical (the desktop guard). */

import { chromium } from "playwright";
import fs from "node:fs";

const outDir = process.argv[2] ?? "docs/hero-shots/mobile";
const mode = process.argv[3] === "static" ? "static" : "motion";
const URL = "http://127.0.0.1:5173/";

const SIZES = [
  { name: "360x640", width: 360, height: 640 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900, desktop: true },
  { name: "1920x1080", width: 1920, height: 1080, desktop: true },
];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const report = [];

for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    reducedMotion: mode === "static" ? "reduce" : "no-preference",
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="hero"]');
  await page.waitForSelector('.hero-rect[data-painted="1"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(mode === "static" ? 900 : 3600);

  const geo = await page.evaluate(() => {
    const r = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height) };
    };
    const vh = window.innerHeight;
    const signup = r('[data-testid="hero-signup"]');
    const signin = r('[data-testid="hero-signin"]');
    const body = r(".hero-body");
    const stage = r(".hero-stage-wrap");
    const rect = document.querySelector(".hero-rect");
    return {
      vw: window.innerWidth,
      vh,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      docH: document.documentElement.scrollHeight,
      zone: stage,
      rect: rect ? JSON.parse(rect.dataset.rect ?? "null") : null,
      eyebrow: r(".hero-eyebrow"),
      h1: r(".hero-h1"),
      signup,
      signin,
      body,
      micro: r(".hero-micro"),
      chips: r(".hero-chips"),
      signupTopPct: signup ? +((signup.top / vh) * 100).toFixed(1) : null,
      signinTopPct: signin ? +((signin.top / vh) * 100).toFixed(1) : null,
      signupFits: signup ? signup.bottom <= vh : null,
      signinFits: signin ? signin.bottom <= vh : null,
      cls: +(window.__cls ?? 0).toFixed(4),
    };
  });

  await page.screenshot({ path: `${outDir}/${size.name}-first.png` });

  await page.evaluate(() => {
    const el = document.querySelector(".hero-chips");
    if (el) el.scrollIntoView({ block: "end", behavior: "instant" });
    else window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${size.name}-scrolled.png` });

  if (size.desktop) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/${size.name}-diff.png` });
  }

  report.push({ size: size.name, ...geo });
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
