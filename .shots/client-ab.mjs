/* client-ab.mjs — capture the client dashboard at every route and width.
   Usage: node .shots/client-ab.mjs <prefix>   (a = working tree, b = tag) */

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const prefix = process.argv[2] ?? "a";
const ROUTES = [
  ["overview", "/dashboard"],
  ["vaults", "/dashboard/vaults"],
  ["ledger", "/dashboard/ledger"],
  ["payments", "/dashboard/payments"],
  ["settings", "/dashboard/settings"],
];
const SIZES = [
  [1440, 900],
  [390, 844],
];

mkdirSync(".shots/client", { recursive: true });

const browser = await chromium.launch();
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:5173/signin", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const s = JSON.stringify({ email: "client@vaultlance.ai", role: "client", since: 1_760_000_000_000 });
    localStorage.setItem("vl.dash.session", s);
    sessionStorage.setItem("vl.dash.session", s);
  });
  for (const [name, path] of ROUTES) {
    await page.goto(`http://127.0.0.1:5173${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `.shots/client/${prefix}-${name}-${w}.png` });
    console.log(`${prefix} ${name} ${w}`);
  }
  await ctx.close();
}
await browser.close();
