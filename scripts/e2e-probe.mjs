#!/usr/bin/env node
/* One exploratory pass over the deployed freelancer UI. It creates a fresh
   e2e- account, seals a $5 vault with a real zip, and reads the invite code from
   the drawer's own Copy invite link path. No credential or full id is printed. */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const APP = (process.env.E2E_FRONTEND_URL || process.env.E2E_APP_URL || "https://vault-lance-ai.vercel.app").replace(/\/+$/, "");
const API = (() => {
  const raw = (process.env.E2E_API_URL || "https://vaultlance-ai.fly.dev").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
})();
const EVIDENCE = path.resolve("docs/e2e/evidence");
fs.mkdirSync(EVIDENCE, { recursive: true });

const last4 = (v) => (v ? `…${String(v).slice(-4)}` : "none");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip() {
  const files = [
    { name: "delivery/README.md", body: Buffer.from("# Probe delivery\n\nA real zip uploaded through the deployed drawer.\n") },
    { name: "delivery/manifest.txt", body: Buffer.from("probe zip\n") },
  ];
  const locals = [], centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), data = file.body, crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

const stamp = Date.now();
const email = `e2e-${stamp}-freelancer@example.com`;
const password = `Vp-${crypto.randomBytes(18).toString("base64url")}`;
const clientEmail = `e2e-${stamp}-client@example.com`;
const clientPassword = `Vp-${crypto.randomBytes(18).toString("base64url")}`;
const project = `e2e-${stamp}-probe`;
const payout = process.env.SANDBOX_BUYER_EMAIL || "";

const browser = await chromium.launch({
  headless: process.env.E2E_HEADLESS !== "0",
  args: ["--disable-blink-features=AutomationControlled"],
  ignoreDefaultArgs: ["--enable-automation"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.setDefaultTimeout(45_000);

try {
  console.log(`APP ${APP}`);
  console.log(`PROJECT ${project}`);
  console.log(`FREELANCER ${last4(email.split("@")[0])}@example.com`);
  if (!payout) throw new Error("SANDBOX_BUYER_EMAIL is empty; the freelancer payout field cannot be filled.");

  const clientReg = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: clientEmail, password: clientPassword, fullName: "Cora Client", role: "CLIENT" }),
  });
  if (clientReg.status !== 201) throw new Error(`client setup answered ${clientReg.status}`);
  console.log("CLIENT SETUP PASS");

  await page.goto(`${APP}/signup`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("role-freelancer").click();
  await page.locator("#signup-name").waitFor({ state: "visible" });
  await page.locator("#signup-name").fill("Eve Freelancer");
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-password").fill(password);
  await page.locator("#signup-paypal").fill(payout);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="signup-submit"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, { timeout: 20_000 });
  await page.getByTestId("signup-submit").click({ force: true });
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes("Your freelancer vault is open.") || /server took too long|already exists|request failed/i.test(text);
  }, { timeout: 30_000 });
  if (!(await page.locator("body").innerText()).includes("Your freelancer vault is open.")) {
    throw new Error("Signup did not reach the success card.");
  }
  console.log("SIGNUP PASS");
  await page.getByRole("link", { name: "Go to Dashboard" }).click();
  await page.waitForURL(/\/dashboard(?:\/|$|\?)/, { timeout: 60_000 });
  await page.locator("body").waitFor({ state: "visible" });
  await sleep(2500);
  console.log("DASHBOARD", page.url());
  console.log("DASHBOARD_TEXT", (await page.locator("body").innerText()).slice(0, 500).replace(/\s+/g, " "));
  await page.screenshot({ path: path.join(EVIDENCE, "probe-01-dashboard.png"), fullPage: true });

  const newButton = page.getByRole("button", { name: /^New vault$/ }).first();
  await newButton.click({ timeout: 20_000 });
  const dialog = page.getByRole("dialog", { name: /New vault/ });
  await dialog.waitFor({ state: "visible" });
  await dialog.getByLabel("Project name").fill(project);
  await dialog.getByLabel("Client email").fill(clientEmail);
  await dialog.getByLabel("Amount in USD").fill("5.00");
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByLabel("Choose files to deliver").setInputFiles({ name: "e2e-probe.zip", mimeType: "application/zip", buffer: makeZip() });
  await dialog.locator('.fd-scan li[data-state="pass"]').first().waitFor({ state: "visible", timeout: 30_000 });
  await sleep(2000);
  const passRows = await dialog.locator('.fd-scan li[data-state="pass"]').count();
  console.log("SCAN_PASS_ROWS", passRows);
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: /Create & invite client/ }).click();
  await page.getByText("Vault created.", { exact: true }).waitFor({ state: "visible", timeout: 90_000 });
  console.log("CREATE PASS");
  await page.screenshot({ path: path.join(EVIDENCE, "probe-02-created.png"), fullPage: true });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await sleep(2500);

  const card = page.getByRole("article", { name: new RegExp(project) }).first();
  await card.waitFor({ state: "visible", timeout: 30_000 });
  console.log("CARD PASS", (await card.innerText()).replace(/\s+/g, " ").slice(0, 260));
  await card.getByRole("button", { name: "Copy invite link" }).click();
  await sleep(800);
  let clipboard = "";
  try { clipboard = await page.evaluate(() => navigator.clipboard.readText()); } catch { /* fall back to toast */ }
  const body = await page.locator("body").innerText();
  const code = (clipboard.match(/VL-[A-Z0-9]{4}-[A-Z0-9]{4}/) || body.match(/VL-[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0] || "";
  console.log("INVITE_CODE", code || "NOT_FOUND");
  console.log("TOAST", (body.match(/Invite link copied[^\n]*/) || [])[0] || "none");
  await page.screenshot({ path: path.join(EVIDENCE, "probe-03-invited.png"), fullPage: true });
} catch (error) {
  console.log("PROBE_FAIL", error?.name, String(error?.message || error).slice(0, 500));
  console.log("URL", page.url());
  const text = await page.locator("body").innerText().catch(() => "");
  console.log("BODY", text.replace(/\s+/g, " ").slice(0, 1200));
  await page.screenshot({ path: path.join(EVIDENCE, "probe-fail.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
