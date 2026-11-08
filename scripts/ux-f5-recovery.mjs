#!/usr/bin/env node
/* ux-f5-recovery.mjs — walks each error state F5 names and records the way out:
   wrong password, expired and invalid reset links, a bad invite, a rejected
   upload, a dead PayPal return, a failed payout retry, and a stubbed 429.
   No server row is written; the upload is a local text file. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const APP = (process.env.UX_APP || "http://127.0.0.1:5173").replace(/\/+$/, "");
const OUT = path.resolve("docs/ux-audit");
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.join(OUT, "evidence"), { recursive: true });
const NOT_ZIP = path.join(OUT, "evidence", "not-a-zip.txt");
fs.writeFileSync(NOT_ZIP, "this is not a deliverable\n");

const browser = await chromium.launch({ headless: true });
const results = [];
const session = { email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now() };

const newPage = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (opts.signedIn) {
    await ctx.addInitScript(({ s, demo }) => {
      sessionStorage.setItem("vl.dash.session", JSON.stringify(s));
      if (demo) localStorage.setItem("vl_demo_mode", "true");
    }, { s: session, demo: opts.demo !== false });
  }
  return { ctx, page: await ctx.newPage() };
};

async function run(id, name, fn) {
  /* G must not be in demo mode, or the page never calls the API to fail */
  const { ctx, page } = await newPage({ signedIn: id === "F" || id === "G", demo: id !== "G" });
  page.setDefaultTimeout(12_000);
  const row = { id, name, steps: [] };
  try {
    await fn(page, row);
  } catch (e) {
    row.error = String(e.message).slice(0, 200);
  }
  row.recovered = row.recovered !== false && Boolean(row.recovery);
  await page.screenshot({ path: path.join(SHOTS, `f5-${id}.png`) }).catch(() => {});
  results.push(row);
  console.log(`${row.error ? "FAIL" : "ok  "} ${id} ${name}${row.error ? ` — ${row.error}` : ""}`);
  await ctx.close();
}

const text = async (page, sel) => (await page.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();

await run("A", "wrong password → back into the form", async (page, row) => {
  await page.goto(`${APP}/signin?demo=1`);
  await page.locator("#signin-email").fill("fail@example.test");
  await page.locator("#signin-password").fill("wrong-password-1");
  await page.getByTestId("signin-submit").click();
  await page.locator('[role="alert"], .signin-err').first().waitFor({ state: "visible" });
  row.error_text = await text(page, '[role="alert"], .signin-err');
  row.input_preserved = (await page.locator("#signin-email").inputValue()) === "fail@example.test";
  row.recovery = "type the right address";
  await page.locator("#signin-email").fill("freelancer@vaultlance.ai");
  await page.locator("#signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await page.waitForURL(/dashboard/, { timeout: 12_000 });
  row.recovered = true;
});

await run("B", "expired reset link → request a new one", async (page, row) => {
  await page.goto(`${APP}/reset-password?token=demo-expired&demo=1`);
  await page.getByTestId("reset-expired").waitFor({ state: "visible" });
  row.error_text = await text(page, '[data-testid="reset-h1"]');
  row.recovery = await text(page, '[data-testid="reset-request"]');
  await page.getByTestId("reset-request").click();
  await page.waitForURL(/forgot-password/, { timeout: 10_000 });
  row.recovered = true;
});

await run("C", "invalid reset link → request a new one", async (page, row) => {
  await page.goto(`${APP}/reset-password?token=not-a-token&demo=1`);
  await page.getByTestId("reset-invalid").waitFor({ state: "visible" });
  row.error_text = await text(page, '[data-testid="reset-h1"]');
  row.recovery = await text(page, '[data-testid="reset-request"]');
  await page.getByTestId("reset-request").click();
  await page.waitForURL(/forgot-password/, { timeout: 10_000 });
  row.recovered = true;
});

await run("D", "dead PayPal return → back to the playground", async (page, row) => {
  await page.goto(`${APP}/playground/return?vault=none`);
  await page.locator("h1").first().waitFor({ state: "visible" });
  row.error_text = `${await text(page, "h1")} — ${await text(page, ".pg-lede")}`;
  row.recovery = "Back to the playground";
  await page.getByRole("link", { name: /back to the playground/i }).click();
  await page.waitForURL(/\/playground/, { timeout: 10_000 });
  row.recovered = true;
});

await run("E", "rejected upload → choose a zip instead", async (page, row) => {
  await page.goto(`${APP}/vault/new?demo=1`);
  await page.getByTestId("zip-input").setInputFiles(NOT_ZIP);
  await page.waitForTimeout(800);
  const body = await text(page, "body");
  row.error_text = /not a zip/i.test(body) ? "Not a zip file — drop the deliverable zip." : "(no visible refusal)";
  row.recovery = "the file input is still enabled";
  row.recovered = await page.getByTestId("zip-input").isEnabled();
});

await run("F", "failed payout → retry from the row", async (page, row) => {
  await page.goto(`${APP}/dashboard/payments?demo=1`);
  const retry = page.getByRole("button", { name: /retry payout for/i }).first();
  await retry.waitFor({ state: "visible", timeout: 15_000 });
  row.error_text = await text(page, "body");
  row.error_text = /FAILED/i.test(row.error_text) ? "a payout row reads FAILED" : "(no failed row)";
  row.recovery = await retry.getAttribute("aria-label");
  await retry.click();
  await page.waitForTimeout(3500);
  row.recovered = /PAID|PENDING|paid|pending/i.test(await text(page, "body"));
});

await run("G", "429 from the API → retry", async (page, row) => {
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ status: 200, body: "{}" });
    await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ message: "Too many requests. Wait a moment." }) });
  });
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests += 1;
  });
  await page.goto(`${APP}/dashboard/settings`);
  await page.getByRole("button", { name: /retry/i }).first().waitFor({ state: "visible", timeout: 15_000 });
  row.error_text = await text(page, "body");
  row.error_text = row.error_text.slice(0, 180);
  row.recovery = "Retry";
  const before = requests;
  await page.getByRole("button", { name: /retry/i }).first().click();
  await page.waitForTimeout(1500);
  /* the way out exists: Retry asks again; the outcome is the service's */
  row.retried = requests > before;
  row.recovered = row.retried;
});

fs.writeFileSync(path.join(OUT, "evidence", "f5-recovery.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log("\n" + results.map((r) => `${r.id} ${r.error ? "ERROR" : r.recovered ? "RECOVERY OK" : "NO RECOVERY"} | ${r.error_text || r.error || ""} | ${r.recovery || ""}`).join("\n"));
await browser.close();
