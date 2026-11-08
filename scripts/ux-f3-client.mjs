#!/usr/bin/env node
/* ux-f3-client.mjs — the client's path on the seeded portal: open invite,
   read the sealed manifest, interrogate, approve, reach files, download.
   Uses the seeded store at /v/<token> (not /demo, whose replay auto-approves). */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

const APP = (process.env.UX_APP || "http://127.0.0.1:5173").replace(/\/+$/, "");
const TOKEN = "cx7-29kd-wq1m";
const OUT = path.resolve("docs/ux-audit");
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(15_000);
const f = { flow: "F3 client", steps: [], friction: [], startedAt: Date.now() };
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`) }).catch(() => {});
const axe = async (label) => {
  try {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    f[`axe_${label}`] = r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id);
  } catch (e) { f[`axe_${label}`] = [`error ${e.message.slice(0, 80)}`]; }
};

try {
  await page.goto(`${APP}/v/${TOKEN}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h2, h1");
  f.steps.push(`invite opened; title "${await page.title()}"`);

  /* sealed manifest: rows must not be actionable */
  const getButtons = await page.getByRole("button", { name: /^Download / }).count();
  f.lockedDownloadButtons = getButtons;
  f.steps.push(`locked manifest: ${await page.locator('[role="listitem"]').count()} rows, ${getButtons} download buttons`);
  await shot("f3-01-portal-locked");
  await axe("portal");

  /* approve before asking: is the reason reachable? */
  const approve = page.getByTestId("approve-pay");
  f.approveDisabled = await approve.isDisabled();
  f.approveReason = await approve.evaluate((el) => {
    const ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    return (el.getAttribute("title") || "") + " " + ids.map((id) => document.getElementById(id)?.textContent || "").join(" ");
  });
  f.steps.push(`approve disabled=${f.approveDisabled}; reason="${f.approveReason.trim().slice(0, 120)}"`);
  if (f.approveDisabled && !f.approveReason.trim()) f.friction.push("approve is disabled with no reachable explanation");

  /* interrogate */
  const q = page.getByTestId("portal-question");
  await q.fill("Was the deliverable altered after sealing?");
  await q.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="portal-stream"] [class*="prov"], [data-testid="portal-stream"] li, [data-testid="portal-stream"] article').length > 0 || /integrity|Playwright|brief/i.test(document.querySelector('[data-testid="portal-stream"]')?.textContent || ""), { timeout: 8000 }).catch(() => {});
  f.streamText = (await page.getByTestId("portal-stream").innerText()).replace(/\s+/g, " ").slice(0, 160);
  f.steps.push(`asked a question; stream "${f.streamText.slice(0, 80)}"`);
  await shot("f3-02-answered");
  f.approveEnabledAfterAsk = !(await approve.isDisabled());

  /* approve */
  const t = Date.now();
  await approve.click();
  await page.waitForURL(/\/files$/, { timeout: 10_000 });
  f.approveToFilesMs = Date.now() - t;
  await page.waitForTimeout(1600);
  f.filesH1 = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ");
  f.steps.push(`approve → files in ${f.approveToFilesMs}ms; h1 "${f.filesH1}"`);
  await shot("f3-03-files");
  await axe("files");

  /* download one row */
  const get = page.getByRole("button", { name: /^Download / }).first();
  f.fileButtons = await page.getByRole("button", { name: /^Download / }).count();
  if (await get.count()) {
    const dl = page.waitForEvent("download", { timeout: 2500 }).catch(() => null);
    await get.click();
    const got = await dl;
    f.downloadWorked = Boolean(got);
    if (got) f.downloadName = got.suggestedFilename();
    f.steps.push(`download ${got ? `started "${got.suggestedFilename()}"` : "did NOT start"}`);
    if (!got) f.friction.push("the row's download button fires no download");
  } else {
    f.friction.push("released rows expose no download button");
  }

  f.seconds = Math.round((Date.now() - f.startedAt) / 100) / 10;
} catch (e) {
  f.error = String(e.message).slice(0, 200);
  f.steps.push(`ERROR ${f.error}`);
  await shot("f3-error");
}

fs.mkdirSync(path.join(OUT, "evidence"), { recursive: true });
fs.writeFileSync(path.join(OUT, "evidence", "f3-client.json"), `${JSON.stringify(f, null, 2)}\n`);
console.log(JSON.stringify({ ok: !f.error, seconds: f.seconds, downloadWorked: f.downloadWorked, h1: f.filesH1, friction: f.friction, steps: f.steps }, null, 1));
await browser.close();
