import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const out = {};

/* keyboard + focus, reduced motion (final state, no entrance interference) */
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await p.goto("http://127.0.0.1:5180/", { waitUntil: "networkidle" });
  const order = [];
  for (let i = 0; i < 3; i++) {
    await p.keyboard.press("Tab");
    order.push(await p.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 14), outline: `${cs.outlineWidth} ${cs.outlineColor}`, offset: cs.outlineOffset };
    }));
  }
  out.tabOrder = order;
  out.h1Accessible = await p.evaluate(() => {
    const h1 = document.querySelector("h1");
    return { srText: h1.querySelector(".sr-only")?.textContent, ariaHiddenWords: [...h1.querySelectorAll(".word")].every((w) => w.getAttribute("aria-hidden") === "true") };
  });
  await p.close();
}

/* click routing (motion allowed, 1s delay) */
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  await p.goto("http://127.0.0.1:5180/", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.click('[data-testid="hero-signup"]');
  await p.waitForTimeout(1400);
  out.signupRoute = new URL(p.url()).pathname;
  await p.goto("http://127.0.0.1:5180/", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.click('[data-testid="hero-signin"]');
  await p.waitForTimeout(1400);
  out.signinRoute = new URL(p.url()).pathname;
  await p.close();
}

/* scroll handoff + idle float */
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  await p.goto("http://127.0.0.1:5180/", { waitUntil: "networkidle" });
  await p.waitForTimeout(3200);
  const readFloat = () => p.evaluate(() => getComputedStyle(document.querySelector(".hero-stage-wrap")).transform);
  const a = await readFloat();
  await p.waitForTimeout(700);
  const b = await readFloat();
  out.idleFloat = { a, b, moving: a !== b };
  out.handoff = await p.evaluate(async () => {
    const copy = document.querySelector(".hero-copy");
    const before = getComputedStyle(copy).opacity;
    window.scrollTo(0, window.innerHeight * 0.03);
    await new Promise((r) => setTimeout(r, 120));
    const mid = getComputedStyle(copy).opacity;
    window.scrollTo(0, window.innerHeight * 0.06);
    await new Promise((r) => setTimeout(r, 120));
    const after = getComputedStyle(copy).opacity;
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 120));
    const back = getComputedStyle(copy).opacity;
    return { before, mid, after, back };
  });
  await p.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 1));
