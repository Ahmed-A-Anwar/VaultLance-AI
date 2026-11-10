#!/usr/bin/env node
/**
 * benchmark-routes.mjs — repeatable production route benchmark.
 *
 * It measures fresh-context direct loads for every dashboard route, the two
 * auth pages, and an existing PAID audit room. It also measures warm in-app
 * dashboard navigation and the real sign-in handoff. The route content is
 * read-only: it signs in with the existing E2E client, opens vaults, and never
 * creates or changes a vault, file, payment or ledger row.
 *
 * Usage:
 *   npm run benchmark:routes
 *   npm run benchmark:routes -- --runs=5
 *   npm run benchmark:routes -- --runs=5 --write-report
 *   npm run benchmark:routes -- --json=.tmp/routes.json
 *
 * Credentials come from backend/.env.E2E via the npm script. Tokens, passwords
 * and vault ids are never printed.
 *
 * The report block is delimited by:
 *   <!-- route-benchmark:start -->
 *   <!-- route-benchmark:end -->
 * so `--write-report` only replaces that block.
 */

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const arg = (name, fallback) => {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const DEFAULT_APP = "https://vault-lance-ai.vercel.app";
const DEFAULT_API = "https://vaultlance-ai-1.onrender.com/api";
const APP = (arg("app", process.env.BENCHMARK_APP_URL || DEFAULT_APP)).replace(/\/+$/, "");
const API = (() => {
  const raw = (arg("api", process.env.BENCHMARK_API_URL || DEFAULT_API)).replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
})();
const API_ORIGIN = new URL(API).origin;
const RUNS = Math.min(9, Math.max(1, Number(arg("runs", process.env.BENCHMARK_RUNS || "3")) || 3));
const WRITE_REPORT = process.argv.includes("--write-report");
const JSON_PATH = arg("json", "");
const REPORT_PATH = arg("report", "time performance .md");
const TIMEOUT = 60_000;
const VIEWPORT = { width: 1440, height: 1000 };
const EMAIL = process.env.E2E_CLIENT_EMAIL;
const PASSWORD = process.env.E2E_CLIENT_PASSWORD;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};
const summary = (values) => ({
  median: median(values),
  min: values.length ? Math.min(...values) : null,
  max: values.length ? Math.max(...values) : null,
  runs: [...values],
});
const ms = (value) => (value == null ? "—" : `${value.toLocaleString("en-US")} ms`);
const range = (entry) => (entry?.median == null ? "—" : `${entry.min.toLocaleString("en-US")}–${entry.max.toLocaleString("en-US")} ms`);
const escapeCell = (value) => String(value).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

if (!EMAIL || !PASSWORD) {
  console.error("Set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD, or run via npm run benchmark:routes.");
  process.exit(1);
}

async function apiLogin() {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.data?.token) {
    throw new Error(`API login failed (${response.status}); check the E2E client credentials and API URL.`);
  }
  return body.data;
}

async function readHealth() {
  try {
    const response = await fetch(`${API_ORIGIN}/health`, { signal: AbortSignal.timeout(15_000) });
    const body = await response.json();
    return body?.revision || null;
  } catch {
    return null;
  }
}

let browser;
let token = "";
let paidVaultId = null;
let expectedVaults = 0;
let accountRole = "";
let accountEmail = "";
let vaultStatusCounts = {};
const pageErrors = [];
const serverTiming = [];

function makeSession(role, email) {
  return JSON.stringify({
    email,
    role: role === "freelancer" ? "freelancer" : "client",
    since: Date.now(),
  });
}

const freshContext = () => browser.newContext({ viewport: VIEWPORT });

async function seededContext() {
  const context = await freshContext();
  const stored = makeSession(accountRole, accountEmail);
  await context.addInitScript(
    ({ session, bearer }) => {
      window.sessionStorage.setItem("vl.dash.session", session);
      window.localStorage.setItem("vl.dash.session", session);
      window.sessionStorage.setItem("vl_token", bearer);
    },
    { session: stored, bearer: token }
  );
  return context;
}

async function ready(page, name) {
  if (name === "signin") {
    await page.locator("#signin-email").waitFor({ state: "visible", timeout: TIMEOUT });
    return;
  }
  if (name === "signup") {
    await page.locator('[data-testid="signup-card"] [data-testid="role-client"]').waitFor({ state: "visible", timeout: TIMEOUT });
    return;
  }
  if (name === "dashboard") {
    await page.locator("h2#dash-vaults-h").waitFor({ state: "visible", timeout: TIMEOUT });
    await page.waitForFunction(
      (count) => document.querySelectorAll("article.dash-vault").length >= count,
      expectedVaults,
      { timeout: TIMEOUT }
    );
    return;
  }
  if (name === "vaults") {
    await page.locator("h1#dash-vaults-h").waitFor({ state: "visible", timeout: TIMEOUT });
    await page.waitForFunction(
      (count) => document.querySelectorAll("article.dash-vault").length >= count,
      expectedVaults,
      { timeout: TIMEOUT }
    );
    return;
  }
  if (name === "payments") {
    await page.locator(".pay-page").waitFor({ state: "visible", timeout: TIMEOUT });
    await page.waitForFunction(
      () => !document.querySelector(".pay-grid-skel") && !!document.querySelector('[role="tabpanel"]'),
      null,
      { timeout: TIMEOUT }
    );
    return;
  }
  if (name === "ledger") {
    await page.locator("h1#dash-ledger-h").waitFor({ state: "visible", timeout: TIMEOUT });
    await page.waitForFunction(() => !document.querySelector(".dash-ledger-skel"), null, { timeout: TIMEOUT });
    return;
  }
  if (name === "settings") {
    await page.locator('[data-testid="account-summary"]').waitFor({ state: "visible", timeout: TIMEOUT });
    return;
  }
  if (name === "audit") {
    await page.locator(".room-title").waitFor({ state: "visible", timeout: TIMEOUT });
    return;
  }
  throw new Error(`Unknown readiness condition: ${name}`);
}

function collectErrors(page, label) {
  return page.on("pageerror", (error) => {
    pageErrors.push({ label, message: String(error.message || error).slice(0, 300) });
  });
}

async function measureDirect(name, path, authenticated) {
  const context = authenticated ? await seededContext() : await freshContext();
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  collectErrors(page, `direct:${name}`);
  page.on("response", (response) => {
    if (response.request().method() === "GET" && response.url().includes("/api/vaults")) {
      const timing = response.headers()["server-timing"];
      if (timing) serverTiming.push({ page: name, timing });
    }
  });
  try {
    const started = Date.now();
    await page.goto(`${APP}${path}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    await ready(page, name);
    const elapsed = Date.now() - started;
    console.log(`direct ${name.padEnd(10)} ${String(elapsed).padStart(5)} ms`);
    return elapsed;
  } finally {
    await context.close();
  }
}

async function measureWarmRoute(page, name, path) {
  const started = Date.now();
  await Promise.all([
    page.waitForURL((url) => url.pathname === path, { timeout: TIMEOUT }),
    page.locator(`nav.dash-rail a.dash-nav-item[href="${path}"]`).click(),
  ]);
  await ready(page, name);
  return Date.now() - started;
}

async function cacheProbe() {
  const read = () =>
    fetch(`${API}/vaults`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    }).then(async (response) => ({
      status: response.status,
      timing: response.headers.get("server-timing"),
      body: await response.text(),
    }));

  const first = read();
  await sleep(800);
  const second = read();
  const [a, b] = await Promise.all([first, second]);
  return {
    first: { status: a.status, timing: a.timing },
    second: { status: b.status, timing: b.timing },
  };
}

function markdownBlock(result) {
  const { direct, warm, signinTransition: transition, cacheProbe: cache } = result.results;
  const routeRows = [
    ["Sign in", "/signin", direct.signin, null],
    ["Sign up", "/signup", direct.signup, null],
    ["Dashboard", "/dashboard", direct.dashboard, warm.dashboard],
    ["Vaults", "/dashboard/vaults", direct.vaults, warm.vaults],
    ["Payments", "/dashboard/payments", direct.payments, warm.payments],
    ["Ledger", "/dashboard/ledger", direct.ledger, warm.ledger],
    ["Settings", "/dashboard/settings", direct.settings, warm.settings],
    ["Audit room", result.auditPath ? "/vault/:id" : "no PAID vault", direct.audit, null],
  ];

  const directRows = routeRows
    .map(
      ([label, path, direct, warm]) =>
        `| **${escapeCell(label)}** \`${escapeCell(path)}\` | ${ms(direct?.median)} | ${range(direct)} | ${ms(warm?.median)} | ${range(warm)} |`
    )
    .join("\n");

  const transitionRows = transition
    ? [
        ["Submit → `/dashboard` URL", "toUrl"],
        ["URL → dashboard shell", "fromUrlToShell"],
        ["URL → sign-in form gone", "fromUrlToFormGone"],
        ["URL → all vault cards", "fromUrlToData"],
      ]
        .map(([label, key]) => {
          const values = transition.map((run) => run[key]);
          const entry = summary(values);
          return `| ${label} | ${ms(entry.median)} | ${range(entry)} |`;
        })
        .join("\n")
    : "| Sign-in transition | — | — |";

  const cacheLine = cache?.first
    ? `| First read | \`${escapeCell(cache.first.timing || "no Server-Timing")}\` |\n| Second read (800 ms later) | \`${escapeCell(cache.second.timing || "no Server-Timing")}\` |`
    : "| Cache probe | — |";

  return [
    `- **Run:** \`npm run benchmark:routes -- --runs=${result.runs} --write-report\``,
    `- **Measured:** ${result.measuredAt}`,
    `- **App:** ${result.app}`,
    `- **API:** ${result.api}${result.apiRevision ? ` (revision \`${result.apiRevision}\`)` : ""}`,
    `- **Account:** ${result.account.role}, ${result.account.vaults} vaults (${result.account.paidVaults} PAID)`,
    `- **Viewport:** ${result.viewport.width} × ${result.viewport.height}, Chromium headless`,
    `- **Errors:** ${result.pageErrors.length} page error${result.pageErrors.length === 1 ? "" : "s"}`,
    "",
    "| Route | Direct median | Direct range | Warm median | Warm range |",
    "|---|---:|---:|---:|---:|",
    directRows,
    "",
    "Warm runs are in-app rail transitions in one signed-in tab; direct runs are fresh contexts. The sign-in rows measure the page load only.",
    "",
    "| Sign-in handoff | Median | Range |",
    "|---|---:|---:|",
    transitionRows,
    "",
    "| Vault-list probe | Server-Timing |",
    "|---|---|",
    cacheLine,
  ].join("\n");
}

function updateReport(result) {
  const block = markdownBlock(result);
  const start = "<!-- route-benchmark:start -->";
  const end = "<!-- route-benchmark:end -->";
  let report;
  try {
    report = readFileSync(REPORT_PATH, "utf8");
  } catch {
    throw new Error(`Report not found: ${REPORT_PATH}`);
  }

  if (report.includes(start) && report.includes(end)) {
    const from = report.indexOf(start) + start.length;
    const to = report.indexOf(end);
    report = `${report.slice(0, from)}\n${block}\n${report.slice(to)}`;
  } else {
    report = `${report.trimEnd()}\n\n## Repeatable route benchmark\n\n${start}\n${block}\n${end}\n`;
  }
  writeFileSync(REPORT_PATH, report);
}

async function main() {
  const login = await apiLogin();
  token = login.token;
  accountRole = String(login.user.role).toUpperCase() === "FREELANCER" ? "freelancer" : "client";
  accountEmail = login.user.email;
  if (accountRole !== "client") {
    throw new Error("benchmark:routes expects E2E_CLIENT_*; the dashboard route markers are the client markers.");
  }

  const vaultResponse = await fetch(`${API}/vaults`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const vaultBody = await vaultResponse.json().catch(() => null);
  if (!vaultResponse.ok || !Array.isArray(vaultBody?.data)) {
    throw new Error(`Vault list failed (${vaultResponse.status}); cannot choose the benchmark account state.`);
  }
  const vaults = vaultBody.data;
  expectedVaults = vaults.length;
  vaultStatusCounts = {};
  for (const vault of vaults) vaultStatusCounts[vault.status] = (vaultStatusCounts[vault.status] ?? 0) + 1;
  const paid = vaults.find((vault) => ["PAID", "CAPTURE_PENDING", "COMPLETED", "UNLOCKED"].includes(String(vault.status).toUpperCase()));
  paidVaultId = paid?.id ?? null;
  const paidVaults = vaults.filter((vault) => ["PAID", "CAPTURE_PENDING", "COMPLETED", "UNLOCKED"].includes(String(vault.status).toUpperCase())).length;
  const auditPath = paidVaultId ? `/vault/${paidVaultId}` : null;

  browser = await chromium.launch({ headless: true });
  const direct = {};
  const directValues = {};

  for (const [name, path] of [
    ["signin", "/signin"],
    ["signup", "/signup"],
  ]) {
    directValues[name] = [];
    for (let run = 0; run < RUNS; run += 1) {
      directValues[name].push(await measureDirect(name, path, false));
    }
    direct[name] = summary(directValues[name]);
  }

  for (const [name, path] of [
    ["dashboard", "/dashboard"],
    ["vaults", "/dashboard/vaults"],
    ["payments", "/dashboard/payments"],
    ["ledger", "/dashboard/ledger"],
    ["settings", "/dashboard/settings"],
  ]) {
    directValues[name] = [];
    for (let run = 0; run < RUNS; run += 1) {
      directValues[name].push(await measureDirect(name, path, true));
    }
    direct[name] = summary(directValues[name]);
  }

  if (auditPath) {
    directValues.audit = [];
    for (let run = 0; run < RUNS; run += 1) {
      directValues.audit.push(await measureDirect("audit", auditPath, true));
    }
    direct.audit = summary(directValues.audit);
  } else {
    direct.audit = summary([]);
    console.log("direct audit      skipped: no PAID vault available");
  }

  const signinTransition = [];
  for (let run = 0; run < RUNS; run += 1) {
    const context = await freshContext();
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    collectErrors(page, `transition:${run + 1}`);
    try {
      await page.goto(`${APP}/signin`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
      await ready(page, "signin");
      await page.fill("#signin-email", EMAIL);
      await page.fill("#signin-password", PASSWORD);
      const started = Date.now();
      await page.locator('[data-testid="signin-submit"]').click({ force: true });
      await page.waitForURL(/\/dashboard(?:\/|$|\?)/, { timeout: TIMEOUT });
      const toUrl = Date.now() - started;
      const staleAtUrl = await page.locator('[data-testid="signin-card"]').isVisible().catch(() => false);
      await page.locator(".dash").waitFor({ state: "visible", timeout: TIMEOUT });
      const fromUrlToShell = Date.now() - started - toUrl;
      await page.locator('[data-testid="signin-card"]').waitFor({ state: "hidden", timeout: TIMEOUT }).catch(() => {});
      const fromUrlToFormGone = Date.now() - started - toUrl;
      await ready(page, "dashboard");
      const cards = await page.locator("article.dash-vault").count();
      const fromUrlToData = Date.now() - started - toUrl;
      signinTransition.push({ toUrl, fromUrlToShell, fromUrlToFormGone, fromUrlToData, total: Date.now() - started, staleAtUrl, cards });
      console.log(`transition       URL ${String(toUrl).padStart(5)} ms, shell ${String(fromUrlToShell).padStart(4)} ms, form gone ${String(fromUrlToFormGone).padStart(4)} ms, cards ${String(fromUrlToData).padStart(5)} ms`);
    } finally {
      await context.close();
    }
  }

  const warmValues = { dashboard: [], vaults: [], payments: [], ledger: [], settings: [] };
  {
    const context = await seededContext();
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    collectErrors(page, "warm");
    try {
      await page.goto(`${APP}/dashboard`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
      await ready(page, "dashboard");
      const sequence = [
        ["vaults", "/dashboard/vaults"],
        ["payments", "/dashboard/payments"],
        ["ledger", "/dashboard/ledger"],
        ["settings", "/dashboard/settings"],
        ["dashboard", "/dashboard"],
      ];
      for (let run = 0; run < RUNS; run += 1) {
        for (const [name, path] of sequence) {
          const elapsed = await measureWarmRoute(page, name, path);
          warmValues[name].push(elapsed);
          console.log(`warm ${name.padEnd(12)} ${String(elapsed).padStart(5)} ms`);
        }
      }
    } finally {
      await context.close();
    }
  }
  const warm = Object.fromEntries(Object.entries(warmValues).map(([name, values]) => [name, summary(values)]));

  let cache = null;
  try {
    cache = await cacheProbe();
    console.log(`cache            ${cache.first.timing || "no timing"} → ${cache.second.timing || "no timing"}`);
  } catch (error) {
    console.log(`cache            probe failed: ${String(error.message || error).slice(0, 160)}`);
  }

  const result = {
    measuredAt: new Date().toISOString(),
    app: APP,
    api: API,
    apiRevision: await readHealth(),
    account: {
      role: accountRole,
      vaults: expectedVaults,
      paidVaults,
      statuses: vaultStatusCounts,
    },
    runs: RUNS,
    viewport: VIEWPORT,
    auditPath,
    results: { direct, warm, signinTransition, cacheProbe: cache, serverTiming },
    pageErrors,
  };

  if (JSON_PATH) {
    mkdirSync(dirname(JSON_PATH), { recursive: true });
    writeFileSync(JSON_PATH, JSON.stringify(result, null, 2));
    console.log(`Wrote JSON: ${JSON_PATH}`);
  }

  console.log("\n" + markdownBlock(result) + "\n");
  if (WRITE_REPORT) {
    updateReport(result);
    console.log(`Updated report: ${REPORT_PATH}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
