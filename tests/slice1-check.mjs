/* slice1-check.mjs — the two proofs Slice 1 has to carry:
   1. the client dashboard is pixel-identical before and after the shell change
   2. the freelancer shell renders its own labels, badge and action

   Run after: node tests/slice1-shots.mjs before  and  ... after */

import { chromium } from "@playwright/test";
import sharp from "sharp";
import path from "node:path";
import { readdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://127.0.0.1:5173";
const shots = (phase, file) => path.join(process.cwd(), ".shots", phase, file);

/* ---- 1. client pixel diff ---- */
const files = (await readdir(path.join(process.cwd(), ".shots", "before"))).filter((f) => f.endsWith(".png"));
let totalDiff = 0;

for (const file of files) {
  const a = await sharp(shots("before", file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(shots("after", file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    console.log(`  ${file}: SIZE MISMATCH ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}`);
    totalDiff += 1;
    continue;
  }

  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) differing++;
  }
  totalDiff += differing;
  console.log(`  ${file}: ${a.info.width}x${a.info.height} — ${differing} differing pixels`);
}

console.log(totalDiff === 0 ? "CLIENT DIFF: zero" : `CLIENT DIFF: ${totalDiff} pixels differ`);

/* ---- 2. the freelancer shell ---- */
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await context.addInitScript(() => {
  const s = { email: "maya.freelancer@example.com", role: "freelancer", since: 1_767_225_600_000, name: "Maya" };
  try {
    window.localStorage.setItem("vl.dash.session", JSON.stringify(s));
    window.sessionStorage.setItem("vl.dash.session", JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
});
const page = await context.newPage();
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

/* .dash-nav only: the sign-out button shares .dash-nav-item and is not a route */
const nav = await page.locator(".dash-nav .dash-nav-label").allTextContents();
const title = await page.locator(".dash-title").textContent();
const cta = (await page.locator(".dash-cta").textContent())?.trim();
const badge = (await page.locator(".dash-badge").textContent())?.trim();
const railWidth = await page.locator(".dash-rail").evaluate((el) => getComputedStyle(el).width);
const strip = await page.locator(".dash-strip").evaluate((el) => getComputedStyle(el).height);

console.log("\nFREELANCER SHELL");
console.log("  nav:", JSON.stringify(nav));
console.log("  title:", JSON.stringify(title));
console.log("  cta:", JSON.stringify(cta), " badge:", JSON.stringify(badge));
console.log("  rail:", railWidth, " strip:", strip);

await page.screenshot({ path: path.join(process.cwd(), ".shots", "freelancer-shell-1440x900.png") });
await browser.close();

const expectNav = ["Overview", "Vaults", "Earnings", "Payments", "Settings"];
const navOk = JSON.stringify(nav) === JSON.stringify(expectNav);
const shellOk = navOk && title === "Overview" && cta === "New vault" && badge === "FREELANCER";
console.log(navOk ? "  nav labels: OK" : "  nav labels: WRONG");
console.log(shellOk ? "  freelancer shell: OK" : "  freelancer shell: FAILED");
process.exit(totalDiff === 0 && shellOk ? 0 : 1);
