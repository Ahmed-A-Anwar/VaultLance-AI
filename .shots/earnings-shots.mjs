/* earnings-shots.mjs — the Earnings page at five widths in five states. */

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SIZES = [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [390, 844],
];
const SESSION = { email: "freelancer@vaultlance.ai", role: "freelancer", since: 1_760_000_000_000 };

mkdirSync(".shots/earnings", { recursive: true });

const browser = await chromium.launch();

async function open(width, height, { emptyStore = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:5173/signin", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ session, emptyStore }) => {
      const s = JSON.stringify(session);
      localStorage.setItem("vl.dash.session", s);
      sessionStorage.setItem("vl.dash.session", s);
      sessionStorage.removeItem("vl.fd.store");
      if (emptyStore) sessionStorage.setItem("vl.fd.empty", "1");
    },
    { session: SESSION, emptyStore }
  );
  return { ctx, page };
}

for (const [w, h] of SIZES) {
  /* populated */
  {
    const { ctx, page } = await open(w, h);
    await page.goto("http://127.0.0.1:5173/dashboard/ledger", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `.shots/earnings/populated-${w}.png`, fullPage: w < 768 });
    console.log("populated", w);
    await ctx.close();
  }

  /* loading: caught inside the 300-618ms mock read */
  {
    const { ctx, page } = await open(w, h);
    await page.goto("http://127.0.0.1:5173/dashboard/ledger", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(190);
    await page.screenshot({ path: `.shots/earnings/loading-${w}.png`, fullPage: w < 768 });
    console.log("loading", w);
    await ctx.close();
  }

  /* filtered, then empty */
  {
    const { ctx, page } = await open(w, h);
    await page.goto("http://127.0.0.1:5173/dashboard/ledger", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2600);
    await page.fill(".fd-earn-filter", "brand");
    await page.waitForTimeout(700);
    await page.screenshot({ path: `.shots/earnings/filtered-${w}.png`, fullPage: w < 768 });
    await page.fill(".fd-earn-filter", "zzzz");
    await page.waitForTimeout(700);
    await page.screenshot({ path: `.shots/earnings/empty-${w}.png`, fullPage: w < 768 });
    console.log("filtered+empty", w);
    await ctx.close();
  }

  /* popover on the first paid row */
  {
    const { ctx, page } = await open(w, h);
    await page.goto("http://127.0.0.1:5173/dashboard/ledger", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2600);
    if (w < 768) {
      await page.locator(".fd-earn-row").first().click();
      await page.waitForTimeout(400);
    } else {
      await page.locator(".ag-row").nth(1).click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: `.shots/earnings/popover-${w}.png`, fullPage: w < 768 });
    console.log("popover", w);
    await ctx.close();
  }
}

/* the no-data empty state: an empty store needs a reload with the seed off */
{
  const { ctx, page } = await open(1440, 900);
  await page.goto("http://127.0.0.1:5173/dashboard/ledger", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  await page.evaluate(() => {
    const raw = sessionStorage.getItem("vl.fd.store");
    if (!raw) return;
    const s = JSON.parse(raw);
    s.vaults = [];
    s.events = [];
    sessionStorage.setItem("vl.fd.store", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  console.log(
    "no-data empty:",
    JSON.stringify(await page.evaluate(() => ({
      rows: document.querySelectorAll(".ag-row").length,
      text: document.querySelector(".fd-empty-text")?.textContent ?? null,
      total: document.querySelector(".fd-earn-total")?.innerText.replace(/\s+/g, " "),
    })))
  );
  await page.screenshot({ path: ".shots/earnings/empty-nodata-1440.png" });
  await ctx.close();
}

await browser.close();
