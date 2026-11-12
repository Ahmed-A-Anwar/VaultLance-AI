#!/usr/bin/env node
import { chromium } from "playwright";
import crypto from "node:crypto";

const APP = (process.env.E2E_FRONTEND_URL || "https://vault-lance-ai.vercel.app").replace(/\/+$/, "");
const email = `e2e-${Date.now()}-trace@example.com`;
const password = `Vp-${crypto.randomBytes(18).toString("base64url")}`;
const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"], ignoreDefaultArgs: ["--enable-automation"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const started = new Map();
page.on("request", (r) => { if (r.url().includes("/api/")) { started.set(r, Date.now()); console.log("REQ", r.method(), r.url()); } });
page.on("response", async (r) => { if (r.url().includes("/api/")) { const ms = Date.now() - (started.get(r.request()) || Date.now()); console.log("RES", r.status(), `${ms}ms`, r.url()); console.log("ACAO", r.headers()["access-control-allow-origin"] || "none"); } });
page.on("requestfailed", (r) => { if (r.url().includes("/api/")) console.log("FAILED", r.failure()?.errorText, r.url()); });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
page.setDefaultTimeout(30_000);
try {
  await page.goto(`${APP}/signup`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("role-freelancer").click();
  await page.locator("#signup-name").waitFor();
  await page.locator("#signup-name").fill("Eve Trace");
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-password").fill(password);
  await page.locator("#signup-paypal").fill(process.env.SANDBOX_BUYER_EMAIL || "");
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-testid="signup-submit"]');
    return b instanceof HTMLButtonElement && !b.disabled;
  }, { timeout: 20_000 });
  console.log("SUBMIT_ENABLED");
  const clickAt = Date.now();
  await page.getByTestId("signup-submit").click({ force: true });
  for (let i = 0; i < 30; i++) {
    const text = await page.locator("body").innerText().catch(() => "");
    const success = text.includes("Your freelancer vault is open.");
    const failure = text.match(/The server took too long[^\n]*|Request failed[^\n]*|[^\n]*already exists[^\n]*|Network request failed[^\n]*/i)?.[0];
    if (success || failure) {
      console.log(success ? "SIGNUP_SUCCESS" : "SIGNUP_FAILURE", `${Date.now() - clickAt}ms`, failure || "");
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("URL", page.url());
} catch (e) {
  console.log("TRACE_ERROR", e?.name, String(e?.message || e).slice(0, 400));
} finally {
  await browser.close().catch(() => {});
}
