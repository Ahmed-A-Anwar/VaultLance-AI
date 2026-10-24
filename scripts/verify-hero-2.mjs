import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const URL = "http://127.0.0.1:5180/";
const OUT = "docs/hero-shots";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = { geometry: {}, entrance: {}, hover: {}, cls: {} };

const initObserver = () => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({
        v: +e.value.toFixed(4),
        src: (e.sources || []).map((s) => (s.node ? `${s.node.tagName}.${String(s.node.className || "").slice(0, 22)}` : "detached")),
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
};

const sizes = [[375, 812], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];

for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(initObserver);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  report.geometry[w] = await page.evaluate(() => {
    const wheel = document.querySelector(".hero-wheel").getBoundingClientRect();
    const up = document.querySelector('[data-testid="hero-signup"]').getBoundingClientRect();
    const inBtn = document.querySelector('[data-testid="hero-signin"]').getBoundingClientRect();
    return {
      wheel: { x: +(((wheel.left + wheel.width / 2) / innerWidth) * 100).toFixed(2), y: +(((wheel.top + wheel.height / 2) / innerHeight) * 100).toFixed(2) },
      signup: { top: +up.top.toFixed(1), h: +up.height.toFixed(1), left: +up.left.toFixed(1), w: +up.width.toFixed(1) },
      signin: { top: +inBtn.top.toFixed(1), h: +inBtn.height.toFixed(1), left: +inBtn.left.toFixed(1), w: +inBtn.width.toFixed(1) },
      gap: +(inBtn.left - up.right).toFixed(1),
      signupTopPct: +((up.top / innerHeight) * 100).toFixed(2),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cls: +window.__shifts.reduce((a, s) => a + s.v, 0).toFixed(4),
      shifts: window.__shifts.slice(0, 5),
      h1: (() => { const cs = getComputedStyle(document.querySelector(".hero-h1")); return { size: cs.fontSize, lh: cs.lineHeight, ls: cs.letterSpacing, weight: cs.fontWeight, family: cs.fontFamily.split(",")[0] }; })(),
      mono: getComputedStyle(document.querySelector(".hero-eyebrow")).fontFamily.split(",")[0],
    };
  });
  await page.screenshot({ path: `${OUT}/final-${w}.png` });
  await ctx.close();
}

/* entrance: sample from first paint with motion allowed */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.addInitScript(initObserver);
  await page.goto(URL, { waitUntil: "commit" });
  const samples = [];
  for (let i = 0; i < 18; i++) {
    samples.push(await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const op = (el) => (el ? +getComputedStyle(el).opacity : -1);
      const st = q(".hero-stage-wrap");
      return {
        t: +(performance.now() / 1000).toFixed(2),
        stage: st ? getComputedStyle(st).transform.slice(0, 34) : "absent",
        eyebrow: op(q(".hero-eyebrow")),
        h1: op(q(".word-inner")),
        body: op(q(".hero-body")),
        signup: op(q('[data-testid="hero-signup"]')),
        chips: op(q(".hero-chips")),
      };
    }));
    if (i === 0) await page.screenshot({ path: `${OUT}/t0-1440.png` });
    await page.waitForTimeout(180);
  }
  report.entrance.samples = samples;
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/t2618-1440.png` });
  report.entrance.after = await page.evaluate(() => ({
    chips: getComputedStyle(document.querySelector(".hero-chips")).opacity,
    stage: getComputedStyle(document.querySelector(".hero-stage-wrap")).transform,
  }));

  await page.hover('[data-testid="hero-signup"]');
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/hover-signup-1440.png` });
  report.hover.signup = await page.evaluate(() => {
    const seam = document.querySelector(".hero-seam-svg path");
    const wheel = document.querySelector(".hero-wheel");
    return {
      seamStroke: getComputedStyle(seam).stroke,
      seamWidth: getComputedStyle(seam).strokeWidth,
      wheel: getComputedStyle(wheel).transform,
      hinge: getComputedStyle(document.querySelector(".hero-hinge-bar")).opacity,
      arrow: getComputedStyle(document.querySelector('[data-testid="hero-signup"] svg')).transform,
      lift: getComputedStyle(document.querySelector('[data-testid="hero-signup"]')).transform,
      shimmer: getComputedStyle(document.querySelector(".hero-shimmer")).transform,
    };
  });

  await page.hover('[data-testid="hero-signin"]');
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/hover-signin-1440.png` });
  report.hover.signin = await page.evaluate(() => ({
    glow: getComputedStyle(document.querySelector(".hero-keypad-glow")).opacity,
    keys: [...document.querySelectorAll(".hero-keypad-key")].map((k) => getComputedStyle(k).opacity),
    connectorDash: document.querySelector(".hero-connector path").style.strokeDashoffset,
    connectorD: document.querySelector(".hero-connector path").getAttribute("d").slice(0, 30),
    border: getComputedStyle(document.querySelector('[data-testid="hero-signin"]')).borderColor,
  }));
  report.cls.motion = await page.evaluate(() => ({ total: +window.__shifts.reduce((a, s) => a + s.v, 0).toFixed(4), shifts: window.__shifts.slice(0, 8) }));
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 1));
