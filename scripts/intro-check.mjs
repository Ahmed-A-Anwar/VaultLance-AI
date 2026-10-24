/* intro-check.mjs — verify the first-visit vault intro.
   usage: node scripts/intro-check.mjs

   Pass 1: fresh profile (no storage) → keypad lights, then one wheel turn,
           then the doors close again.
   Pass 2: hover both buttons → the clips still react as before.
   Pass 3: reload → the intro must not run again. */

import { chromium } from "playwright";
import fs from "node:fs";

const URL = "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/intro";
fs.mkdirSync(OUT, { recursive: true });

const record = () =>
  `(() => {
    window.__samples = [];
    const t0 = performance.now();
    const op = (sel) => {
      const el = document.querySelector(sel);
      return el ? Number(el.style.opacity || 0) : 0;
    };
    const id = setInterval(() => {
      window.__samples.push({
        t: Math.round(performance.now() - t0),
        pad: op('[data-testid="keypad-clip"]'),
        wheel: op('[data-testid="wheel-clip"]'),
      });
    }, 100);
    window.__stop = () => clearInterval(id);
  })()`;

const dump = async (page) => {
  const raw = await page.evaluate(() => {
    window.__stop();
    return window.__samples;
  });
  /* keep only the samples where something changed, to read as a timeline */
  const out = [];
  let last = { pad: -1, wheel: -1 };
  for (const s of raw) {
    if (Math.abs(s.pad - last.pad) > 0.04 || Math.abs(s.wheel - last.wheel) > 0.04) {
      out.push(s);
      last = s;
    }
  }
  return out;
};

const browser = await chromium.launch();

/* ---------- pass 1: first visit ---------- */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
await page.goto(URL, { waitUntil: "load" });
await page.evaluate(record());
/* the intro is ~2.6s entrance + 2s keypad + 0.6s hold + 3.4s turn + 3.4s close */
const clipOpacity = (sel) =>
  page.evaluate(
    (s) => Number(document.querySelector(`[data-testid="${s}"]`)?.style.opacity || 0),
    sel
  );
const waitClip = async (sel, min, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await clipOpacity(sel)) >= min) return true;
    await page.waitForTimeout(150);
  }
  return false;
};
const waitRest = async (ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await clipOpacity("keypad-clip")) < 0.02 && (await clipOpacity("wheel-clip")) < 0.02) return true;
    await page.waitForTimeout(250);
  }
  return false;
};

await page.waitForTimeout(3_600);
await page.screenshot({ path: `${OUT}/01-keypad-lit.png` });
await waitClip("wheel-clip", 0.95, 20_000);
await page.waitForTimeout(1_100);
await page.screenshot({ path: `${OUT}/02-wheel-open.png` });
await page.waitForTimeout(2_200);
await page.screenshot({ path: `${OUT}/03-wheel-late.png` });
await waitRest(25_000);
const first = await dump(page);
console.log("first visit — clip timeline");
for (const s of first) console.log(`  ${String(s.t).padStart(6)}ms  pad ${s.pad.toFixed(2)}  wheel ${s.wheel.toFixed(2)}`);
console.log(
  "  storage flag:",
  await page.evaluate(() => window.localStorage.getItem("vaultpay.hero-intro.v1"))
);

/* ---------- pass 2: hover still works ---------- */
await page.evaluate(record());
await page.hover('[data-testid="hero-signup"]');
await page.waitForTimeout(1_000);
const hoverUp = await page.evaluate(() =>
  Number(document.querySelector('[data-testid="wheel-clip"]').style.opacity || 0)
);
await page.mouse.move(20, 20);
await page.waitForTimeout(1_600);
const leaveUp = await page.evaluate(() =>
  Number(document.querySelector('[data-testid="wheel-clip"]').style.opacity || 0)
);
await page.hover('[data-testid="hero-signin"]');
await page.waitForTimeout(1_200);
const hoverIn = await page.evaluate(() =>
  Number(document.querySelector('[data-testid="keypad-clip"]').style.opacity || 0)
);
await page.mouse.move(20, 20);
await page.waitForTimeout(2_600);
const leaveIn = await page.evaluate(() =>
  Number(document.querySelector('[data-testid="keypad-clip"]').style.opacity || 0)
);
await dump(page);
console.log("hover after the intro");
console.log(`  sign up hover wheel opacity ${hoverUp.toFixed(2)} → leave ${leaveUp.toFixed(2)}`);
console.log(`  sign in hover keypad opacity ${hoverIn.toFixed(2)} → leave ${leaveIn.toFixed(2)}`);

/* ---------- pass 3: reload plays it again ---------- */
await page.reload({ waitUntil: "load" });
await page.evaluate(record());
await page.waitForTimeout(16_000);
const second = await dump(page);
console.log("reload — clip timeline");
for (const s of second) console.log(`  ${String(s.t).padStart(6)}ms  pad ${s.pad.toFixed(2)}  wheel ${s.wheel.toFixed(2)}`);

/* ---------- pass 4: reduced motion ---------- */
const rmCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const rmPage = await rmCtx.newPage();
await rmPage.goto(URL, { waitUntil: "load" });
await rmPage.evaluate(record());
await rmPage.waitForTimeout(9_000);
const rm = await dump(rmPage);
console.log("reduced motion — clip timeline");
console.log(`  ${rm.filter((s) => s.pad > 0 || s.wheel > 0).length} samples with a visible clip`);
console.log(
  "  storage flag:",
  await rmPage.evaluate(() => window.localStorage.getItem("vaultpay.hero-intro.v1"))
);
await rmCtx.close();

/* ---------- pass 5: phone, fresh visit ---------- */
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mPage = await mCtx.newPage();
await mPage.goto(URL, { waitUntil: "load" });
await mPage.evaluate(record());
await mPage.waitForTimeout(14_000);
const phone = await dump(mPage);
console.log("phone 390x844, first visit — clip timeline");
for (const s of phone) console.log(`  ${String(s.t).padStart(6)}ms  pad ${s.pad.toFixed(2)}  wheel ${s.wheel.toFixed(2)}`);
await mPage.screenshot({ path: `${OUT}/04-phone-first.png` });
await mCtx.close();

console.log("console log lines (desktop pass):");
for (const l of logs) console.log("  " + l);

await browser.close();
