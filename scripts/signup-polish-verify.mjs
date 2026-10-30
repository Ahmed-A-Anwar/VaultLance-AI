/* signup-polish-verify.mjs — the acceptance run for the polished /signup.

   Per viewport: the no-role, freelancer and client states as stills, plus the
   card's box, the rail's box, the vault's visible left edge, CLS and overflow.
   Then the behaviours: hover preview, keyboard preview, the draw, role switch,
   the submit sequence, and reduced motion. */

import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/signup/polish";
fs.mkdirSync(OUT, { recursive: true });

const CLS_PROBE = `window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });`;

const browser = await chromium.launch();
const rows = [];

const shot = async (page, name) => {
  const png = `${OUT}/${name}.png`;
  await page.screenshot({ path: png });
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  await sharp(png).resize(Math.round(info.width > 1200 ? 1100 : info.width)).jpeg({ quality: 82 }).toFile(`${OUT}/${name}.jpg`);
  return { data, info };
};

for (const [W, H] of [[1440, 900], [1920, 1080], [1280, 720], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.addInitScript(CLS_PROBE);
  await page.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1100);

  const base = await page.evaluate(() => {
    const r = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) };
    };
    return {
      card: r(".signup-card"),
      rail: r(".signup-rail"),
      compact: r(".stepper-compact-row"),
      role: r(".role-btn"),
      input: r(".signup-input"),
      brand: r(".signup-brand"),
      pressed: [...document.querySelectorAll(".role-btn")].map((b) => b.getAttribute("aria-pressed")),
      docW: document.documentElement.scrollWidth,
      innerW: innerWidth,
      railDisplay: getComputedStyle(document.querySelector(".signup-rail")).display,
      compactDisplay: getComputedStyle(document.querySelector(".signup-stepper-compact")).display,
    };
  });

  const noRole = await shot(page, `${W}-none`);

  await page.click('[data-testid="role-freelancer"]');
  await page.waitForTimeout(1600);
  const free = await page.evaluate(() => {
    const c = document.querySelector(".signup-card");
    const b = c.getBoundingClientRect();
    return {
      h: +b.height.toFixed(1),
      top: +b.top.toFixed(1),
      bottom: +b.bottom.toFixed(1),
      scrolls: c.scrollHeight > c.clientHeight + 1,
      sub: document.querySelector(".signup-sub").textContent,
      chip: (() => {
        const el = document.querySelector(".signup-chip");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const h1 = document.querySelector(".signup-h1").getBoundingClientRect();
        return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h1Bottom: +h1.bottom.toFixed(1) };
      })(),
      labels: [...document.querySelectorAll(".stepper-label")].map((l) => l.textContent),
      chipLabels: [...document.querySelectorAll(".stepper-chip-label")].map((l) => l.textContent),
      activeNodes: document.querySelectorAll('.stepper-step[data-state="active"]').length,
      here: !!document.querySelector(".stepper-here"),
    };
  });
  const freelancer = await shot(page, `${W}-freelancer`);

  await page.click('[data-testid="signup-change-role"]');
  await page.waitForTimeout(700);
  await page.click('[data-testid="role-client"]');
  await page.waitForTimeout(1600);
  const client = await page.evaluate(() => ({
    sub: document.querySelector(".signup-sub").textContent,
    labels: [...document.querySelectorAll(".stepper-label")].map((l) => l.textContent),
    chips: [...document.querySelectorAll(".stepper-chip-label")].map((l) => l.textContent),
    card: (() => {
      const b = document.querySelector(".signup-card").getBoundingClientRect();
      return { h: +b.height.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1) };
    })(),
    cls: window.__cls,
    docW: document.documentElement.scrollWidth,
  }));
  const clientShot = await shot(page, `${W}-client`);

  /* the vault's visible left edge: dark pixels right of the card */
  let vaultLeft = null;
  if (W >= 1024) {
    const { data, info } = freelancer;
    const from = Math.round(base.card.right) + 2;
    for (let x = from; x < info.width; x++) {
      let hits = 0;
      for (let y = 0; y < info.height; y += 4) if (data[(y * info.width + x) * info.channels] < 120) hits++;
      if (hits > 12) { vaultLeft = x; break; }
    }
  }

  rows.push({ W, H, base, freelancer: free, client, vaultLeft, gap: vaultLeft !== null ? vaultLeft - base.card.right : null });
  await page.close();
}

/* ---------- behaviours at 1440 ---------- */
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const stepperState = () =>
  page.evaluate(() => {
    const st = document.querySelector(".stepper");
    return {
      opacity: +getComputedStyle(st).opacity,
      labels: [...document.querySelectorAll(".stepper-label")].map((l) => l.textContent),
      note: !!document.querySelector(".stepper-note"),
      drawOffset: getComputedStyle(document.querySelector(".stepper-rail-draw")).strokeDashoffset,
      drawOpacity: +getComputedStyle(document.querySelector(".stepper-rail-draw")).opacity,
    };
  });

const before = await stepperState();
await page.hover('[data-testid="role-freelancer"]');
await page.waitForTimeout(400);
const hovered = await stepperState();
await page.mouse.move(20, 20);
await page.waitForTimeout(400);
const afterHover = await stepperState();

/* keyboard: focus the client card without hovering */
await page.keyboard.press("Tab"); // skip link
await page.keyboard.press("Tab"); // back link
await page.keyboard.press("Tab"); // freelancer
await page.keyboard.press("Tab"); // client
await page.waitForTimeout(400);
const focused = await stepperState();
const focusedName = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));

/* pick, then watch the rail draw */
const t0 = Date.now();
await page.keyboard.press("Enter");
await page.waitForTimeout(120);
const drawing = await stepperState();
await page.waitForTimeout(400);
const drawing2 = await stepperState();
await page.waitForTimeout(900);
const drawn = await stepperState();
const stepAt = await page.evaluate(() => document.querySelector(".signup-sub").textContent);

/* fill and submit: the nodes light in sequence, then the success card */
await page.fill("#signup-name", "Ada Lovelace");
await page.fill("#signup-email", "ada@example.com");
await page.fill("#signup-password", "Analytical1!engine");
if (await page.$("#signup-paypal")) await page.fill("#signup-paypal", "ada@example.com");
const litAt = [];
const submitAt = Date.now();
await page.click('[data-testid="signup-submit"]');
for (let i = 0; i < 14; i++) {
  litAt.push(await page.evaluate(() => document.querySelectorAll('.stepper-step[data-state="done"]').length));
  await page.waitForTimeout(120);
}
await page.waitForTimeout(500);
const afterSubmit = await page.evaluate(() => ({
  step: document.querySelector(".signup-done-h")?.textContent ?? null,
  done: document.querySelectorAll('.stepper-step[data-state="done"]').length,
  path: location.pathname,
}));

/* reduced motion */
const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await rm.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
await rm.waitForTimeout(500);
await rm.click('[data-testid="role-freelancer"]');
await rm.waitForTimeout(150);
const rmStep = await rm.evaluate(() => ({
  sub: document.querySelector(".signup-sub")?.textContent,
  drawOffset: getComputedStyle(document.querySelector(".stepper-rail-draw")).strokeDashoffset,
  labels: [...document.querySelectorAll(".stepper-label")].map((l) => l.textContent.length),
  here: getComputedStyle(document.querySelector(".stepper-here-dot") ?? document.body).animationName,
}));
await rm.fill("#signup-name", "Ada");
await rm.fill("#signup-email", "ada@example.com");
await rm.fill("#signup-password", "Analytical1!engine");
if (await rm.$("#signup-paypal")) await rm.fill("#signup-paypal", "ada@example.com");
await rm.click('[data-testid="signup-submit"]');
await rm.waitForTimeout(200);
const rmDone = await rm.evaluate(() => ({
  done: document.querySelectorAll('.stepper-step[data-state="done"]').length,
  success: !!document.querySelector(".signup-done-h"),
}));

console.log(
  JSON.stringify(
    { rows, behaviours: { before, hovered, afterHover, focused, focusedName, drawing, drawing2, drawn, stepAt, litAt, afterSubmit, rmStep, rmDone } },
    null,
    2
  )
);
await browser.close();
