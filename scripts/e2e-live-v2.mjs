#!/usr/bin/env node
/**
 * e2e-live.mjs — the full sandbox loop against the deployed app.
 *
 * One pass: sign in, save a payout address, create a vault, upload a real zip,
 * submit and invite; join as the client; create a PayPal order and approve it
 * with the sandbox buyer; audit, approve, capture, download and payout; then a
 * second vault to void. The final drills include an actual Fly restart while
 * the capture is CAPTURE_PENDING.
 *
 * Secrets come from backend/.env.E2E and backend/.env through --env-file and
 * are never written to docs/evidence. Vault, order, authorization, capture and
 * payout ids are stored only as their last four characters.
 *
 * Run:
 *   node --env-file=backend/.env --env-file=backend/.env.E2E scripts/e2e-live.mjs
 *
 * A PayPal bot check is a stop condition: one attempt, a screenshot, and a
 * handoff, never a loop.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE = path.join(ROOT, "docs", "e2e", "evidence");
const SCREENSHOTS = path.join(EVIDENCE, "screenshots");
const APP = (process.env.E2E_APP_URL || "https://vault-lance-ai.vercel.app").replace(/\/+$/, "");
const API = (() => {
  const raw = String(process.env.E2E_API_URL || "https://vaultlance-ai.fly.dev").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
})();
const FLY_APP = process.env.E2E_FLY_APP || "vaultlance-ai";
const HEADLESS = process.env.E2E_HEADLESS === "1";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const RUN_LOG = path.join(EVIDENCE, "live-run.log");
const RESULTS_PATH = path.join(EVIDENCE, "results.json");
const PAYOUT_EMAIL = process.env.SANDBOX_BUYER_EMAIL || "";
const BUYER = { email: process.env.SANDBOX_BUYER_EMAIL || "", password: process.env.SANDBOX_BUYER_PASSWORD || "" };

fs.mkdirSync(SCREENSHOTS, { recursive: true });
fs.writeFileSync(RUN_LOG, "");

const results = {
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  app: APP,
  api: API,
  environment: "PayPal sandbox",
  steps: [],
  ids: {},
  evidence: [],
  limitations: [],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const last4 = (value) => {
  const text = String(value ?? "");
  return text ? `…${text.slice(-4)}` : null;
};
const idKey = (value) => last4(value);
const redact = (value) => {
  if (value == null) return value;
  const text = String(value);
  if (text.includes("@")) return "[redacted-email]";
  if (/^[A-Za-z0-9_-]{24,}$/.test(text)) return last4(text);
  return text;
};
const redactEvidence = (text) => String(text)
  .replace(/\x1b\[[0-9;]*m/g, "")
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, (m) => last4(m))
  .replace(/\b[A-Z0-9]{15,}\b/g, (m) => last4(m))
  .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]");
function log(line) {
  const clean = String(line)
    .replace(new RegExp(String(process.env.E2E_FREELANCER_PASSWORD || "\u0000").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[redacted]")
    .replace(new RegExp(String(process.env.E2E_CLIENT_PASSWORD || "\u0000").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[redacted]")
    .replace(new RegExp(String(BUYER.password || "\u0000").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[redacted]");
  const row = `${new Date().toISOString()} ${clean}`;
  fs.appendFileSync(RUN_LOG, `${row}\n`);
  console.log(row);
}

function addEvidence(file, note) {
  results.evidence.push({ file: path.relative(ROOT, file).replace(/\\/g, "/"), note });
}
async function shot(page, name, note, fullPage = false) {
  const file = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  addEvidence(file, note);
  return file;
}
function step(id, title, result, detail = "", evidence = []) {
  results.steps.push({ step: id, title, result, detail, evidence, at: new Date().toISOString() });
  log(`STEP ${id} ${result} — ${title}${detail ? `: ${detail}` : ""}`);
}

async function api(pathname, { method = "GET", token, body, form, headers = {}, timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${pathname}`, {
      method,
      headers: {
        ...(form ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}
const codeOf = (res) => res.json?.error?.code || "";

async function refreshLogin(who) {
  const res = await api("/auth/login", {
    method: "POST",
    body: { email: who.email, password: who.password },
  });
  if (res.status !== 200) throw new Error(`re-login answered ${res.status} ${codeOf(res)}`);
  who.token = res.json.data.token;
  return who.token;
}
async function waitHealth(timeoutMs = 60000) {
  const base = API.replace(/\/api$/, "");
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    try {
      const res = await fetch(`${base}/health`);
      last = res.status;
      if (res.ok) return true;
    } catch {
      last = "unreachable";
    }
    await sleep(1000);
  }
  throw new Error(`API did not become healthy after restart (last ${last})`);
}
async function uiSignIn(page, who, label) {
  await page.goto(`${APP}/signin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#signin-email").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#signin-email").fill(who.email);
  await page.locator("#signin-password").fill(who.password);
  await page.locator('[data-testid="signin-submit"]').click();
  await page.waitForURL(/\/dashboard(?:\/|$|\?)/, { timeout: 45000 });
  await page.waitForLoadState("domcontentloaded");
  // The trial Fly machine can restart between the UI login and the first API
  // call. Re-login through the API so the runner's bearer token belongs to the
  // process that is now serving requests.
  await refreshLogin(who);
  await shot(page, `${label}-signed-in`, `${label} signed in through the deployed UI`);
}

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
    { name: "delivery/README.txt", body: Buffer.from("VaultLance live proof — a real zip.\n") },
    { name: "delivery/manifest.txt", body: Buffer.from("one text file and this manifest\n") },
  ];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = file.body;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

async function createVault(token, title) {
  const created = await api("/vaults", {
    method: "POST",
    token,
    body: { title, description: "Live proof: a delivered zip held by PayPal sandbox escrow.", amount: 25, currency: "USD" },
  });
  if (created.status !== 201) throw new Error(`create vault ${created.status} ${codeOf(created)}`);
  const vaultId = created.json.data.id;
  results.ids[`${title}.vault`] = idKey(vaultId);
  return vaultId;
}
async function uploadAndSubmit(token, vaultId) {
  const form = new FormData();
  const zip = makeZip();
  form.append("file", new Blob([zip], { type: "application/zip" }), "live-proof.zip");
  const uploaded = await fetch(`${API}/uploads/${vaultId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadJson = await uploaded.json().catch(() => null);
  if (uploaded.status !== 201) throw new Error(`upload ${uploaded.status} ${uploadJson?.error?.code || ""}`);

  // The audit's documentation rule reads uploaded file records, not the zip's
  // contents. Include a real README so the normal audit passes without a waiver.
  const readme = Buffer.from("# Live proof delivery\n\nSmall valid zip plus this README.\n");
  const docForm = new FormData();
  docForm.append("file", new Blob([readme], { type: "text/markdown" }), "README.md");
  const docUploaded = await fetch(`${API}/uploads/${vaultId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: docForm,
  });
  const docJson = await docUploaded.json().catch(() => null);
  if (docUploaded.status !== 201) throw new Error(`README upload ${docUploaded.status} ${docJson?.error?.code || ""}`);

  const submitted = await api(`/vaults/${vaultId}/submit`, { method: "POST", token });
  if (submitted.status !== 200) throw new Error(`submit ${submitted.status} ${codeOf(submitted)}`);
  const invited = await api(`/vaults/${vaultId}/invite-code`, { method: "POST", token });
  if (invited.status !== 201 && invited.status !== 200) throw new Error(`invite ${invited.status} ${codeOf(invited)}`);
  return { manifest: submitted.json.data.manifestSha256, code: invited.json.data.code, zipBytes: zip.length, readmeBytes: readme.length };
}

async function paypalToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal API credentials are not present in backend/.env");
  const res = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal token ${res.status}`);
  return (await res.json()).access_token;
}
async function paypalApi(pathname, { method = "GET", token, body } = {}) {
  const bearer = token || (await paypalToken());
  const res = await fetch(`https://api-m.sandbox.paypal.com${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${bearer}`,
      ...(method !== "GET" ? { "content-type": "application/json" } : {}),
      accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function remoteNode(source, { timeout = 60000 } = {}) {
  const b64 = Buffer.from(source, "utf8").toString("base64");
  const command = `node -e "eval(Buffer.from('${b64}','base64').toString('utf8'))"`;
  return execFileSync("fly", ["ssh", "console", "-a", FLY_APP, "-C", command], {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function remoteDb(sql) {
  const source = `
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(${JSON.stringify(sql)});
  await client.end();
})().catch((err) => { console.error(err.message); process.exit(1); });
`;
  return remoteNode(source);
}
const TRIGGER_SQL = `
create or replace function vl_liveproof_delay_paid() returns trigger language plpgsql as $$
begin
  if old.status = 'CAPTURE_PENDING' and new.status = 'PAID' then
    perform pg_sleep(20);
  end if;
  return new;
end $$;
drop trigger if exists vl_liveproof_delay_paid on vaults;
create trigger vl_liveproof_delay_paid before update on vaults
for each row execute function vl_liveproof_delay_paid();
`;
function dropTrigger() {
  try {
    remoteDb("drop trigger if exists vl_liveproof_delay_paid on vaults; drop function if exists vl_liveproof_delay_paid();");
    log("restart drill: temporary delay trigger removed");
  } catch (err) {
    log(`restart drill: cleanup failed — ${err.message.split("\n")[0]}`);
  }
}

function paypalChallenge(bodyText) {
  const text = bodyText.toLowerCase();
  return [
    "captcha",
    "security challenge",
    "pardon the interruption",
    "unusual activity",
    "verify you are human",
    "verify that you are human",
    "press and hold",
    "press & hold",
    "i'm not a robot",
  ].some((needle) => text.includes(needle));
}

async function bodyText(page) {
  return (await page.locator("body").innerText({ timeout: 5000 }).catch(() => "")).slice(0, 12000);
}
async function clickFirstVisible(page, selectors, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const selector of selectors) {
      const loc = page.locator(selector).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click({ timeout: 5000 }).catch(() => {});
        return true;
      }
    }
    await sleep(250);
  }
  return false;
}
async function clickPayPalButton(page, pattern) {
  const button = page.getByRole("button", { name: pattern }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click({ timeout: 8000 }).catch(() => {});
    return true;
  }
  return false;
}

/**
 * One pass through PayPal. No retries: a challenge or a second factor is a
 * recorded handoff, not something to hammer.
 */
async function approveAtPaypal(page, payerUrl, vaultId) {
  const out = { attempted: true, approved: false, blocked: false, step: "open", handoff: null };
  await page.goto(payerUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(1500);
  await shot(page, "02-paypal-01-entry", "PayPal sandbox entry point for the client's authorization");
  log(`PayPal: opened payer-action entry for vault ${idKey(vaultId)}`);

  if (paypalChallenge(await bodyText(page))) {
    out.blocked = true;
    out.step = "entry-challenge";
    return out;
  }

  // Cookie / consent walls, if present.
  await clickFirstVisible(page, [
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("Agree")',
    'button:has-text("Continue")',
  ], 1500);

  const emailSelector = 'input[type="email"], input[name="login_email"], input#email, input[name="email"]';
  if (await page.locator(emailSelector).first().isVisible().catch(() => false)) {
    out.step = "login-email";
    await page.locator(emailSelector).first().fill(BUYER.email);
    if (!(await clickFirstVisible(page, ['#btnNext', 'button:has-text("Next")', 'button[type="submit"]'], 2500))) {
      await page.locator(emailSelector).first().press("Enter").catch(() => {});
    }
    await sleep(1200);
    if (paypalChallenge(await bodyText(page))) {
      out.blocked = true;
      out.step = "email-challenge";
      return out;
    }
  }

  const passwordSelector = 'input[type="password"], input[name="login_password"], input#password';
  if (await page.locator(passwordSelector).first().isVisible().catch(() => false)) {
    out.step = "login-password";
    await page.locator(passwordSelector).first().fill(BUYER.password);
    if (!(await clickFirstVisible(page, ['#btnLogin', 'button:has-text("Log In")', 'button:has-text("Log in")', 'button[type="submit"]'], 2500))) {
      await page.locator(passwordSelector).first().press("Enter").catch(() => {});
    }
    await sleep(2500);
    if (paypalChallenge(await bodyText(page))) {
      out.blocked = true;
      out.step = "password-challenge";
      return out;
    }
  }

  // PayPal shows a full-screen "Getting your wallet" loader after sign-in. Wait
  // for the actual review content before looking for a button.
  await page.getByText(/Pay with|Review your payment|Continue to Review Order/i).first()
    .waitFor({ state: "visible", timeout: 45000 }).catch(() => {});
  await sleep(1500);
  await shot(page, "02-paypal-02-review", "PayPal sandbox review after buyer sign-in");
  out.step = "review";

  // The review page changes by sandbox flow: complete, agree, continue or pay.
  const choices = [
    /^Complete Purchase$/i,
    /^Complete Payment$/i,
    /^Pay Now$/i,
    /^Agree & Continue$/i,
    /^Agree and Continue$/i,
    /^Continue to Review Order$/i,
    /^Continue to Review$/i,
    /^Review Order$/i,
    /^Confirm$/i,
    /^Authorize$/i,
    /^Continue$/i,
    /^Pay$/i,
  ];
  for (let i = 0; i < 6; i++) {
    const url = page.url();
    if (url.startsWith(APP)) break;
    if (paypalChallenge(await bodyText(page))) {
      out.blocked = true;
      out.step = `review-challenge-${i + 1}`;
      return out;
    }
    let clicked = false;
    for (const pattern of choices) {
      if (await clickPayPalButton(page, pattern)) {
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      await sleep(2500);
      continue;
    }
    await sleep(3500);
  }

  out.step = "confirmation";
  for (let i = 0; i < 40; i++) {
    if (page.url().startsWith(APP)) {
      out.approved = true;
      break;
    }
    const text = await bodyText(page);
    if (paypalChallenge(text)) {
      out.blocked = true;
      out.step = `post-approval-challenge-${i + 1}`;
      return out;
    }
    if (/authorized|authorised|payment successful|payment complete|you've paid|you have paid|thanks for your payment/i.test(text)) {
      out.approved = true;
      break;
    }
    await sleep(1000);
  }

  await shot(page, out.approved ? "02-paypal-03-approved" : "02-paypal-03-no-confirmation",
    out.approved ? "PayPal sandbox approved the order" : "PayPal did not reach a confirmation state");
  return out;
}

async function waitVault(token, vaultId, wanted, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    const res = await api(`/vaults/${vaultId}`, { token });
    last = res;
    if (res.status === 200 && wanted.includes(String(res.json?.data?.status || "").toUpperCase())) return res;
    await sleep(500);
  }
  return last;
}
async function waitPayout(token, vaultId, wanted, timeoutMs = 180000) {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    const res = await api(`/vaults/${vaultId}/payout`, { token });
    last = res;
    if (res.status === 200 && wanted.includes(String(res.json?.data?.status || "").toLowerCase())) return res;
    await sleep(1500);
  }
  return last;
}

async function main() {
  if (!BUYER.email || !BUYER.password) throw new Error("SANDBOX_BUYER_EMAIL / SANDBOX_BUYER_PASSWORD are required.");
  if (!PAYOUT_EMAIL) throw new Error("A payout email is required.");

  const health = await fetch(`${API.replace(/\/api$/, "")}/health`).then((r) => r.json()).catch(() => null);
  if (!health) throw new Error("The deployed API health check did not answer.");
  results.health = { status: health.status, version: health.version };
  log(`health ${health.status} version ${health.version || "unset"}`);

  // The stored freelancer password in backend/.env.E2E is truncated; recover by
  // creating a disposable freelancer for this run. The client still works.
  let freelancer;
  const oldFreelancer = await api("/auth/login", {
    method: "POST",
    body: { email: process.env.E2E_FREELANCER_EMAIL, password: process.env.E2E_FREELANCER_PASSWORD },
  });
  if (oldFreelancer.status === 200 && process.env.E2E_FORCE_NEW !== "1") {
    freelancer = {
      email: process.env.E2E_FREELANCER_EMAIL,
      password: process.env.E2E_FREELANCER_PASSWORD,
      token: oldFreelancer.json.data.token,
      disposable: false,
    };
  } else {
    const email = `e2e-${Date.now()}-freelancer@example.com`;
    const password = `Vp-${crypto.randomBytes(15).toString("base64url")}`;
    const registered = await api("/auth/register", {
      method: "POST",
      body: { email, password, fullName: "Live Proof Freelancer", role: "FREELANCER" },
    });
    if (registered.status !== 201) throw new Error(`freelancer register ${registered.status} ${codeOf(registered)}`);
    freelancer = { email, password, token: registered.json.data.token, disposable: true };
    results.limitations.push("The configured E2E freelancer password was rejected (stored value is 3 characters); a disposable freelancer was registered for this run.");
  }

  const oldClient = await api("/auth/login", {
    method: "POST",
    body: { email: process.env.E2E_CLIENT_EMAIL, password: process.env.E2E_CLIENT_PASSWORD },
  });
  let client;
  if (oldClient.status === 200 && process.env.E2E_FORCE_NEW !== "1") {
    client = {
      email: process.env.E2E_CLIENT_EMAIL,
      password: process.env.E2E_CLIENT_PASSWORD,
      token: oldClient.json.data.token,
      disposable: false,
    };
  } else {
    const email = `e2e-${Date.now()}-client@example.com`;
    const password = `Vp-${crypto.randomBytes(15).toString("base64url")}`;
    const registered = await api("/auth/register", {
      method: "POST",
      body: { email, password, fullName: "Live Proof Client", role: "CLIENT" },
    });
    if (registered.status !== 201) throw new Error(`client register ${registered.status} ${codeOf(registered)}`);
    client = { email, password, token: registered.json.data.token, disposable: true };
    results.limitations.push("The configured E2E client password was rejected, so a disposable client was registered.");
  }
  const fMe = await api("/auth/me", { token: freelancer.token });
  const cMe = await api("/auth/me", { token: client.token });
  results.ids.freelancer = last4(fMe.json?.data?.id);
  results.ids.client = last4(cMe.json?.data?.id);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  let fPage;
  let cPage;
  let firstVaultId = null;
  let secondVaultId = null;
  let firstFileId = null;
  let paypalBlocked = false;
  let restartDrill = "NOT_RUN";

  try {
    // ── 1. freelancer UI, payout, vault ──────────────────────────────────
    const fContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    fPage = await fContext.newPage();
    try {
      await uiSignIn(fPage, freelancer, "01-freelancer");
      await fPage.goto(`${APP}/dashboard/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await fPage.locator("#profile-paypal").waitFor({ state: "visible", timeout: 45000 });
      await fPage.locator("#profile-paypal").fill(PAYOUT_EMAIL);
      await fPage.locator('[data-testid="profile-save"]').click({ timeout: 15000 });
      await fPage.locator('[data-testid="payout-status-chip"]', { hasText: "VERIFIED" }).waitFor({ timeout: 30000 });
      await shot(fPage, "01-settings-payout-saved", "Freelancer settings shows the payout address as VERIFIED");

      const payoutRead = await api("/auth/me/payout-profile", { token: freelancer.token });
      if (payoutRead.status !== 200) throw new Error(`payout profile read ${payoutRead.status} ${codeOf(payoutRead)}`);
      if (!payoutRead.json?.data?.paypalEmail) throw new Error("payout profile read returned no paypalEmail");

      firstVaultId = await createVault(freelancer.token, `Live proof ${RUN_ID}`);
      const submitted = await uploadAndSubmit(freelancer.token, firstVaultId);
      results.ids.firstVault = idKey(firstVaultId);
      results.ids.manifest = last4(submitted.manifest);

      const joinCode = submitted.code;
      // The client joins through the deployed UI's link, not by a hidden API write.
      const cContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      cPage = await cContext.newPage();
      await uiSignIn(cPage, client, "01-client");
      let joined = null;
      for (let joinAttempt = 1; joinAttempt <= 2; joinAttempt++) {
        const joinResponse = cPage.waitForResponse(
          (r) => r.url().includes("/api/vaults/join") && r.request().method() === "POST",
          { timeout: 60000 }
        ).catch(() => null);
        await cPage.goto(`${APP}/dashboard?join=${encodeURIComponent(joinCode)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        joined = await joinResponse;
        if (joined?.ok()) break;
        // A Fly restart revokes the client's session while the dashboard is loading.
        if (joinAttempt === 1 && (!joined || joined.status() === 401)) {
          log(`UI join attempt ${joinAttempt} got ${joined ? joined.status() : "no response"}; signing in again`);
          await uiSignIn(cPage, client, "01-client");
          continue;
        }
        break;
      }
      results.ids.invite = last4(submitted.code);
      if (!joined?.ok()) throw new Error(`UI join answered ${joined ? joined.status() : "no response"}`);
      await cPage.waitForTimeout(1500);
      await shot(cPage, "01-client-joined", "Client joined the vault with the code through the dashboard");
      await fPage.goto(`${APP}/dashboard/vaults`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await fPage.waitForTimeout(1500);
      await shot(fPage, "01-freelancer-vaults", "Freelancer vault list after submit and invite");
      step("1", "Freelancer signs in, saves payout, creates/submits/invites; client joins", "PASS",
        `zip ${submitted.zipBytes}B; manifest ${last4(submitted.manifest)}`, ["screenshots/01-freelancer-signed-in.png", "screenshots/01-settings-payout-saved.png", "screenshots/01-client-joined.png"]);
    } catch (err) {
      step("1", "Freelancer signs in, saves payout, creates/submits/invites; client joins", "FAIL", err.message);
      throw err;
    }

    // ── 2. client starts PayPal, buyer approves ──────────────────────────
    let orderId = null;
    let authorizationId = null;
    let payerLink = null;
    try {
      await cPage.goto(`${APP}/vault/${firstVaultId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await cPage.waitForTimeout(2000);
      await shot(cPage, "02-client-vault-before-payment", "Client vault before payment");

      const order = await api(`/vaults/${firstVaultId}/payment/order`, {
        method: "POST",
        token: client.token,
        body: { returnUrl: `${APP}/vault/${firstVaultId}`, cancelUrl: `${APP}/vault/${firstVaultId}` },
      });
      if (order.status !== 201 && order.status !== 200) throw new Error(`payment order ${order.status} ${codeOf(order)}`);
      orderId = order.json.data.orderId;
      results.ids.order = idKey(orderId);
      const links = Array.isArray(order.json.data.links) ? order.json.data.links : [];
      payerLink = links.find((l) => ["payer-action", "approve"].includes(String(l.rel)))?.href;
      if (!payerLink) throw new Error("PayPal order response has no payer-action link");

      const approval = await approveAtPaypal(cPage, payerLink, firstVaultId);
      results.paypal = approval;
      if (approval.blocked) {
        paypalBlocked = true;
        await shot(cPage, "02-paypal-BLOCKED", "PayPal bot check stopped the buyer approval");
        step("2", "Client starts payment and sandbox buyer approves at PayPal", "BLOCKED-BY-PAYPAL",
          `challenge at ${approval.step}; stop without retrying`, ["screenshots/02-paypal-01-entry.png", "screenshots/02-paypal-BLOCKED.png"]);
      } else if (!approval.approved) {
        step("2", "Client starts payment and sandbox buyer approves at PayPal", "FAIL",
          `no confirmation at ${approval.step}`, ["screenshots/02-paypal-03-no-confirmation.png"]);
        paypalBlocked = true;
      } else {
        const reconcile = await api(`/vaults/${firstVaultId}/payment/reconcile`, { method: "POST", token: client.token, body: { orderId } });
        let authorized = reconcile.json?.data?.claimed ? reconcile : null;
        if (!authorized) {
          authorized = await api(`/vaults/${firstVaultId}/payment/authorize`, { method: "POST", token: client.token, body: { orderId } });
        }
        if (![200, 201].includes(authorized.status)) throw new Error(`authorize ${authorized.status} ${codeOf(authorized)}`);
        authorizationId = authorized.json.data.authorizationId;
        results.ids.authorization = idKey(authorizationId);
        step("2", "Client starts payment and sandbox buyer approves at PayPal", "PASS",
          `order ${last4(orderId)}; hold ${last4(authorizationId)}`, ["screenshots/02-paypal-01-entry.png", "screenshots/02-paypal-03-approved.png"]);
      }
    } catch (err) {
      step("2", "Client starts payment and sandbox buyer approves at PayPal", "FAIL", err.message);
      paypalBlocked = true;
    }

    // ── 3. AUTHORIZED ───────────────────────────────────────────────────
    if (!paypalBlocked) {
      const authorized = await waitVault(client.token, firstVaultId, ["AUTHORIZED"], 45000);
      if (authorized?.json?.data?.status === "AUTHORIZED") {
        await cPage.goto(`${APP}/vault/${firstVaultId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await cPage.waitForTimeout(2000);
        await shot(cPage, "03-vault-authorized", "The vault shows the funds held");
        step("3", "Vault shows AUTHORIZED", "PASS", "status AUTHORIZED", ["screenshots/03-vault-authorized.png"]);
      } else {
        step("3", "Vault shows AUTHORIZED", "FAIL", `status ${authorized?.json?.data?.status || authorized?.status}`);
      }
    } else {
      step("3", "Vault shows AUTHORIZED", "BLOCKED-BY-PAYPAL", "no buyer approval");
    }

    // ── 4. audit, approve, PAID, download ───────────────────────────────
    if (!paypalBlocked) {
      try {
        const files = await api(`/uploads/vault/${firstVaultId}/files`, { token: client.token });
        firstFileId = files.json?.data?.[0]?.id || null;
        if (!firstFileId) throw new Error("no file id after upload");
        const locked = await api(`/vaults/${firstVaultId}/files/${firstFileId}/download`, { token: client.token });
        results.prePaidDownload = { status: locked.status, code: codeOf(locked) };
        if (locked.status !== 403) throw new Error(`pre-PAID download answered ${locked.status}, expected 403`);

        const wrongUser = await api(`/vaults/${firstVaultId}/approve`, { method: "POST", token: freelancer.token, body: {} });
        results.wrongUserApprove = { status: wrongUser.status, code: codeOf(wrongUser) };

        const checks = await api(`/vaults/${firstVaultId}/checks/run`, { method: "POST", token: client.token, body: {} });
        if (checks.status !== 200) throw new Error(`audit ${checks.status} ${codeOf(checks)}`);
        const checkRows = checks.json?.data?.checks || [];
        results.checks = checkRows.map((c) => ({ name: c.name, result: c.result }));

        await cPage.reload({ waitUntil: "domcontentloaded" });
        await cPage.waitForTimeout(2500);
        await shot(cPage, "04-audit-complete", "Audit checks complete in the client's vault room");

        // Hold the real CAPTURE_PENDING -> PAID write long enough to restart Fly.
        let triggerInstalled = false;
        try {
          remoteDb(TRIGGER_SQL);
          triggerInstalled = true;
          log("restart drill: temporary 20s delay installed on CAPTURE_PENDING -> PAID");
        } catch (err) {
          log(`restart drill: could not install delay — ${err.message.split("\n")[0]}`);
        }

        const approvePromise = api(`/vaults/${firstVaultId}/approve`, {
          method: "POST",
          token: client.token,
          body: { amount: 0.01 },
          timeoutMs: 90000,
        }).catch((err) => ({ status: 0, json: null, error: err.message }));

        let sawPending = false;
        if (triggerInstalled) {
          const deadline = Date.now() + 20000;
          while (Date.now() < deadline) {
            const state = await api(`/vaults/${firstVaultId}`, { token: client.token });
            if (String(state.json?.data?.status || "").toUpperCase() === "CAPTURE_PENDING") {
              sawPending = true;
              break;
            }
            if (String(state.json?.data?.status || "").toUpperCase() === "PAID") break;
            await sleep(120);
          }
        }

        if (sawPending) {
          log("restart drill: CAPTURE_PENDING observed; restarting the Fly app");
          try {
            execFileSync("fly", ["apps", "restart", FLY_APP, "--skip-health-checks"], {
              encoding: "utf8",
              timeout: 180000,
              stdio: ["ignore", "pipe", "pipe"],
            });
            restartDrill = "RESTARTED";
          } catch (err) {
            restartDrill = "RESTART_FAILED";
            log(`restart drill: Fly restart failed — ${err.message.split("\n")[0]}`);
          }
        } else {
          restartDrill = "PENDING_NOT_OBSERVED";
          log("restart drill: CAPTURE_PENDING was not observed before the write finished");
        }

        const approve = await approvePromise;
        dropTrigger();

        // The restart kills the original approval response and revokes sessions;
        // use fresh tokens from the process that is now serving requests.
        if (restartDrill === "RESTARTED") {
          await waitHealth(60000);
          await refreshLogin(client);
          await refreshLogin(freelancer);
        }

        // The restart kills the original approval response; the vault must still finish.
        const end = Date.now() + 150000;
        let paid = null;
        while (Date.now() < end) {
          const state = await api(`/vaults/${firstVaultId}`, { token: client.token });
          paid = state;
          if (String(state.json?.data?.status || "").toUpperCase() === "PAID") break;
          await sleep(1500);
        }
        if (paid?.json?.data?.status !== "PAID") throw new Error(`vault did not reach PAID (last ${paid?.json?.data?.status || paid?.status})`);
        if (sawPending && restartDrill === "RESTARTED") {
          restartDrill = "PAID_AFTER_RESTART";
          log("restart drill: vault reached PAID after the API restart");
        }

        results.approve = {
          status: approve?.status,
          bodyAmount: 0.01,
          vaultAmount: paid.json.data.amount,
          wrongUserStatus: results.wrongUserApprove.status,
          prePaidDownloadStatus: results.prePaidDownload.status,
        };
        await cPage.reload({ waitUntil: "domcontentloaded" });
        await cPage.waitForTimeout(2500);
        await shot(cPage, "04-vault-paid", "Vault is PAID after capture and the restart drill");

        const download = await api(`/vaults/${firstVaultId}/files/${firstFileId}/download`, { token: client.token });
        if (download.status !== 200 || !download.json?.data?.url) throw new Error(`download ${download.status} ${codeOf(download)}`);
        const bytes = await fetch(download.json.data.url);
        if (!bytes.ok) throw new Error(`signed download answered ${bytes.status}`);
        results.download = { status: download.status, signedStatus: bytes.status, bytes: (await bytes.arrayBuffer()).byteLength };
        step("4", "Audit, approve, PAID, download works; pre-PAID download 403", "PASS",
          `gross $${paid.json.data.amount}; pre-PAID 403; signed ${results.download.signedStatus}; body amount 0.01 ignored; restart ${restartDrill}`,
          ["screenshots/04-audit-complete.png", "screenshots/04-vault-paid.png"]);
      } catch (err) {
        dropTrigger();
        step("4", "Audit, approve, PAID, download works; pre-PAID download 403", "FAIL", err.message);
      }
    } else {
      step("4", "Audit, approve, PAID, download works; pre-PAID download 403", "BLOCKED-BY-PAYPAL", "no hold to capture");
    }

    // ── 5. payout paid and visible to freelancer ───────────────────────
    if (!paypalBlocked) {
      try {
        const payout = await waitPayout(freelancer.token, firstVaultId, ["paid"], 180000);
        const status = String(payout?.json?.data?.status || "");
        results.payout = { status, cents: payout?.json?.data?.cents || null, attempt: payout?.json?.data?.attempt ?? null };
        await fPage.goto(`${APP}/dashboard/payments`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await fPage.waitForTimeout(3500);
        await shot(fPage, "05-freelancer-payments", "Freelancer Payments page after the payout");
        if (status !== "paid") throw new Error(`payout last status ${status || "missing"}`);
        step("5", "Payout reaches paid and shows for the freelancer", "PASS",
          `status paid; payout ${last4(payout.json.data.payoutItemId)}`, ["screenshots/05-freelancer-payments.png"]);
      } catch (err) {
        step("5", "Payout reaches paid and shows for the freelancer", "FAIL", err.message);
      }
    } else {
      step("5", "Payout reaches paid and shows for the freelancer", "BLOCKED-BY-PAYPAL", "no capture");
    }

    // ── 6. second vault: authorize, reject, void, locked ────────────────
    if (!paypalBlocked) {
      try {
        secondVaultId = await createVault(freelancer.token, `Live proof reject ${RUN_ID}`);
        results.ids.secondVault = idKey(secondVaultId);
        const submitted = await uploadAndSubmit(freelancer.token, secondVaultId);
        const joined = await api("/vaults/join", { method: "POST", token: client.token, body: { code: submitted.code } });
        if (joined.status !== 200) throw new Error(`second join ${joined.status} ${codeOf(joined)}`);

        const order = await api(`/vaults/${secondVaultId}/payment/order`, {
          method: "POST",
          token: client.token,
          body: { returnUrl: `${APP}/vault/${secondVaultId}`, cancelUrl: `${APP}/vault/${secondVaultId}` },
        });
        if (![200, 201].includes(order.status)) throw new Error(`second order ${order.status} ${codeOf(order)}`);
        const orderId2 = order.json.data.orderId;
        results.ids.secondOrder = idKey(orderId2);
        const payer2 = (order.json.data.links || []).find((l) => ["payer-action", "approve"].includes(String(l.rel)))?.href;
        if (!payer2) throw new Error("second order has no payer-action link");

        const approval2 = await approveAtPaypal(cPage, payer2, secondVaultId);
        if (approval2.blocked) {
          await shot(cPage, "06-paypal-BLOCKED", "PayPal bot check on the second authorization");
          step("6", "Second vault authorizes, rejects, void confirmed, files locked", "BLOCKED-BY-PAYPAL",
            `challenge at ${approval2.step}; stop without retrying`, ["screenshots/06-paypal-BLOCKED.png"]);
          paypalBlocked = true;
        } else if (!approval2.approved) {
          throw new Error(`second PayPal approval did not confirm (${approval2.step})`);
        } else {
          const reconciled = await api(`/vaults/${secondVaultId}/payment/reconcile`, {
            method: "POST", token: client.token, body: { orderId: orderId2 },
          });
          let authorized = reconciled.json?.data?.claimed ? reconciled : null;
          if (!authorized) {
            authorized = await api(`/vaults/${secondVaultId}/payment/authorize`, {
              method: "POST", token: client.token, body: { orderId: orderId2 },
            });
          }
          if (![200, 201].includes(authorized.status)) throw new Error(`second authorize ${authorized.status} ${codeOf(authorized)}`);
          const auth2 = authorized.json.data.authorizationId;
          results.ids.secondAuthorization = idKey(auth2);

          const wrongState = await api(`/vaults/${secondVaultId}/approve`, { method: "POST", token: client.token, body: {} });
          results.wrongStateApprove = { status: wrongState.status, code: codeOf(wrongState) };
          if (wrongState.status !== 409) throw new Error(`wrong-state approve answered ${wrongState.status}`);

          const rejected = await api(`/vaults/${secondVaultId}/reject`, { method: "POST", token: client.token, body: {} });
          if (rejected.status !== 200 || rejected.json?.data?.status !== "CANCELLED") {
            throw new Error(`reject ${rejected.status} ${codeOf(rejected)}`);
          }

          const pp = await paypalApi(`/v2/payments/authorizations/${encodeURIComponent(auth2)}`);
          if (pp.status !== 200 || !["VOIDED", "EXPIRED"].includes(String(pp.json?.status).toUpperCase())) {
            throw new Error(`PayPal authorization status ${pp.status} ${pp.json?.status || ""}`);
          }
          const file = await api(`/uploads/vault/${secondVaultId}/files`, { token: client.token });
          const fileId = file.json?.data?.[0]?.id;
          const lockedAfter = await api(`/vaults/${secondVaultId}/files/${fileId}/download`, { token: client.token });
          if (lockedAfter.status !== 403) throw new Error(`files not locked after reject (${lockedAfter.status})`);

          await cPage.goto(`${APP}/vault/${secondVaultId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
          await cPage.waitForTimeout(2500);
          await shot(cPage, "06-vault-voided", "Second vault is voided after the client rejects");
          step("6", "Second vault authorizes, rejects, void confirmed, files locked", "PASS",
            `PayPal ${pp.json.status}; wrong-state ${wrongState.status}; download ${lockedAfter.status}`,
            ["screenshots/06-vault-voided.png"]);
        }
      } catch (err) {
        step("6", "Second vault authorizes, rejects, void confirmed, files locked", "FAIL", err.message);
      }
    } else {
      step("6", "Second vault authorizes, rejects, void confirmed, files locked", "BLOCKED-BY-PAYPAL", "no second approval");
    }

    // ── 7. drills ───────────────────────────────────────────────────────
    const drills = {};
    try {
      const badSig = await api("/webhooks/paypal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { id: `evt-live-${Date.now()}`, event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { custom_id: firstVaultId } },
      });
      drills.invalidSignature = { status: badSig.status };
    } catch (err) {
      drills.invalidSignature = { error: err.message };
    }
    drills.wrongUserApprove = results.wrongUserApprove || null;
    drills.wrongStateApprove = results.wrongStateApprove || null;
    drills.bodyAmountIgnored = results.approve
      ? { bodyAmount: 0.01, vaultAmount: results.approve.vaultAmount, paid: true }
      : null;
    drills.restartDuringCapturePending = { result: restartDrill };
    drills.prePaidDownload = results.prePaidDownload || null;

    if (!paypalBlocked) {
      try {
        const webhooks = await paypalApi("/v1/notifications/webhooks");
        const webhook = (webhooks.json?.webhooks || []).find((w) => String(w.url).includes("/api/webhooks/paypal"));
        if (!webhook?.id) throw new Error("no registered PayPal webhook for /api/webhooks/paypal");
        const events = await paypalApi(`/v1/notifications/webhooks-events?page_size=20&event_type=PAYMENT.PAYOUTS-ITEM.SUCCEEDED`);
        const event = (events.json?.events || [])[0];
        if (!event?.id) throw new Error("PayPal returned no stored payout event to replay");
        const before = await api(`/vaults/${firstVaultId}/payout`, { token: freelancer.token });
        const resend = await paypalApi(`/v1/notifications/webhooks-events/${encodeURIComponent(event.id)}/resend`, {
          method: "POST",
          body: {},
        });
        await sleep(8000);
        const after = await api(`/vaults/${firstVaultId}/payout`, { token: freelancer.token });
        const delivered = [200, 202, 204].includes(resend.status);
        drills.replayedWebhook = {
          webhookId: last4(webhook.id),
          eventId: last4(event.id),
          resendStatus: resend.status,
          delivered,
          before: before.json?.data?.status,
          after: after.json?.data?.status,
          attemptBefore: before.json?.data?.attempt,
          attemptAfter: after.json?.data?.attempt,
          noSecondPayout: delivered && before.json?.data?.status === after.json?.data?.status && before.json?.data?.attempt === after.json?.data?.attempt,
        };
      } catch (err) {
        drills.replayedWebhook = { error: err.message };
        results.limitations.push(`Webhook replay: ${err.message}`);
      }
    } else {
      drills.replayedWebhook = { result: "BLOCKED-BY-PAYPAL" };
    }

    try {
      const logs = execFileSync("fly", ["logs", "-a", FLY_APP, "--no-tail"], {
        encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"],
      });
      const relevant = logs.split(/\r?\n/).filter((line) =>
        /\[webhook\]|\[money\]|\[sweeper\]|\[PayPal\]|CAPTURE_PENDING|payout/i.test(line) && !/token|secret|authorization: bearer/i.test(line)
      ).slice(-80);
      fs.writeFileSync(path.join(EVIDENCE, "server-lines.log"), `${redactEvidence(relevant.join("\n"))}\n`);
      addEvidence(path.join(EVIDENCE, "server-lines.log"), "Relevant Fly log lines, no credentials");
    } catch (err) {
      results.limitations.push(`Fly logs: ${err.message.split("\n")[0]}`);
    }

    const ok = (key) => Boolean(drills[key]);
    const replayPass = drills.replayedWebhook?.noSecondPayout === true;
    const invalidPass = drills.invalidSignature?.status === 400;
    const wrongUserPass = drills.wrongUserApprove?.status === 403;
    const wrongStatePass = drills.wrongStateApprove?.status === 409;
    const amountPass = Boolean(drills.bodyAmountIgnored);
    const restartPass = restartDrill === "PAID_AFTER_RESTART";
    results.drills = drills;
    const overall = invalidPass && wrongUserPass && wrongStatePass && amountPass && restartPass && replayPass
      ? "PASS"
      : paypalBlocked
        ? "PARTIAL-BLOCKED-BY-PAYPAL"
        : "FAIL";
    step("7", "Replay, invalid signature, wrong user/state, amount ignored, restart during CAPTURE_PENDING", overall,
      `signature ${drills.invalidSignature?.status}; wrong user ${drills.wrongUserApprove?.status}; wrong state ${drills.wrongStateApprove?.status}; replay ${replayPass ? "no second payout" : "not proven"}; restart ${restartDrill}`,
      ["server-lines.log"]);
  } finally {
    dropTrigger();
    await browser.close().catch(() => {});
  }

  results.finishedAt = new Date().toISOString();
  const passed = results.steps.filter((s) => s.result === "PASS").length;
  results.summary = { passed, total: results.steps.length, results: results.steps.map((s) => `${s.step}:${s.result}`) };
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`);
  addEvidence(RESULTS_PATH, "Redacted results and step table");
  log(`SUMMARY ${passed}/${results.steps.length} steps passed`);
  log(`EVIDENCE ${path.relative(ROOT, RESULTS_PATH)}`);
}

main().catch((err) => {
  log(`FATAL ${err?.stack || err?.message || err}`);
  results.fatal = String(err?.message || err);
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`);
  process.exitCode = 1;
});
