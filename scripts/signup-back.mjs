/* signup-back.mjs — the way back: hero -> /signup -> browser back, captured at
   four beats. Also checks a direct load of /signup (final state, no intro). */

import { chromium } from "playwright";
import fs from "node:fs";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = "docs/hero-shots/signup";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
fs.mkdirSync(OUT, { recursive: true });

const state = (page) =>
  page.evaluate(() => {
    const shift = document.querySelector(".vault-shift");
    const card = document.querySelector(".signup-card");
    const copy = document.querySelector(".hero-copy");
    const cs = shift ? getComputedStyle(shift) : null;
    return {
      path: location.pathname,
      vaultX: cs?.getPropertyValue("--vault-x").trim() ?? null,
      shift: cs?.transform ?? null,
      card: !!card,
      cardOpacity: card ? getComputedStyle(card).opacity : null,
      heroCopy: !!copy,
      copyOpacity: copy ? getComputedStyle(copy).opacity : null,
      eyebrowOpacity: (() => {
        const el = document.querySelector(".hero-eyebrow");
        return el ? getComputedStyle(el).opacity : null;
      })(),
      ghosts: document.querySelectorAll(".scene-ghost").length,
      canvasKept: document.querySelector(".hero-canvas")?.__mark === "kept",
      docWidth: document.documentElement.scrollWidth,
    };
  });

const browser = await chromium.launch();

/* ---- back ---- */
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(3600);
await page.evaluate(() => {
  const c = document.querySelector(".hero-canvas");
  if (c) c.__mark = "kept";
});
await page.click('[data-testid="hero-signup"]');
await page.waitForFunction(() => location.pathname === "/signup");
await page.waitForTimeout(2600);
await page.evaluate(() => {
  const c = document.querySelector(".hero-canvas");
  if (c && c.__mark === "kept") window.__survived = true;
});
const before = await state(page);

const backFrames = [
  { t: 0, name: "back-t0" },
  { t: 300, name: "back-t300" },
  { t: 800, name: "back-t800" },
  { t: 1600, name: "back-end" },
];
const backs = [];
for (const f of backFrames) {
  if (f.t === 0) {
    await page.goBack();
    await page.waitForFunction(() => location.pathname === "/");
  } else {
    // re-run the whole walk for each beat so the sampling stays honest
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3600);
    await page.click('[data-testid="hero-signup"]');
    await page.waitForFunction(() => location.pathname === "/signup");
    await page.waitForTimeout(2600);
    await page.goBack();
    await page.waitForFunction(() => location.pathname === "/");
  }
  if (f.t) await page.waitForTimeout(f.t);
  await page.screenshot({ path: `${OUT}/${W}-${f.name}.png` });
  backs.push({ t: f.t, ...(await state(page)) });
}

/* ---- direct load of /signup ---- */
const direct = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await direct.goto(`${URL.replace(/\/$/, "")}/signup`, { waitUntil: "networkidle" });
await direct.waitForTimeout(400);
const directAt = await state(direct);
await direct.screenshot({ path: `${OUT}/${W}-direct.png` });

console.log(
  JSON.stringify(
    { before, survived: await page.evaluate(() => !!window.__survived), backs, direct: directAt },
    null,
    2
  )
);
await browser.close();
