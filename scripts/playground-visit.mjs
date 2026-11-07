/**
 * playground-visit.mjs — the timed, twice-in-a-row production visit.
 *
 * One browser tab goes landing -> /playground -> both roles -> both bundled
 * samples -> real PayPal sandbox approval -> real capture -> reset. The timer
 * starts at the landing request and stops at PAID, so it measures the visitor's
 * whole path, including PayPal. Credentials are read from backend/.env.e2e and
 * never printed.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.PLAYGROUND_BASE_URL || "https://vault-lance-ai.vercel.app").replace(/\/$/, "");
const RUNS = Number(process.env.PLAYGROUND_RUNS || 2);
const LIMIT_SECONDS = 180;

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 1) continue;
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const env = parseEnv(fs.readFileSync(path.join(ROOT, "backend", ".env.e2e"), "utf8"));
const buyer = {
  email: env.SANDBOX_BUYER_EMAIL || env.PAYPAL_SANDBOX_BUYER_EMAIL,
  password: env.SANDBOX_BUYER_PASSWORD || env.PAYPAL_SANDBOX_BUYER_PASSWORD,
};
if (!buyer.email || !buyer.password) throw new Error("Sandbox buyer credentials are missing from backend/.env.e2e.");

const artifactDir = path.join(ROOT, ".playground-artifacts");
fs.mkdirSync(artifactDir, { recursive: true });

const log = (...args) => console.log(...args);

async function visible(locator) {
  return locator.isVisible().catch(() => false);
}

async function statusText(page) {
  return (await page.getByTestId("playground-status").textContent().catch(() => "")) || "";
}

async function waitForPlayground(page) {
  await page.waitForURL((url) => url.pathname === "/playground", { timeout: 60_000 });
  await page.getByTestId("playground-status").waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="playground-status"]')?.textContent?.trim()),
    null,
    { timeout: 60_000 }
  );
}

async function waitForChecks(page, kind) {
  await page.waitForFunction(
    (wanted) => {
      const failed = Number(document.querySelector('[data-testid="playground-failed"]')?.textContent || "0");
      const checks = document.querySelectorAll('[data-testid="playground-checks"] .pg-check').length;
      if (checks < 1) return false;
      return wanted === "complete" ? failed === 0 : failed > 0;
    },
    kind,
    { timeout: 90_000 }
  );
}

async function clickPaypalControl(page, names) {
  for (const name of names) {
    const control = page.getByRole("button", { name }).first();
    if (await visible(control)) {
      await control.click().catch(() => undefined);
      return true;
    }
  }
  return false;
}

async function approveAtPaypal(page) {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    if (!page.url().includes("paypal.com")) return;

    const email = page.locator('input#email, input[name="login_email"], input[type="email"]').first();
    const password = page.locator('input#password, input[name="login_password"], input[type="password"]').first();
    const submit = page
      .locator(
        '#payment-submit-btn, button[data-testid="submit-button"], input[type="submit"], ' +
          'button:has-text("Continue to Review Order"), button:has-text("Complete Purchase"), ' +
          'button:has-text("Agree & Continue"), button:has-text("Pay Now"), button:has-text("Confirm")'
      )
      .first();

    if (await visible(email)) {
      const value = await email.inputValue().catch(() => "");
      if (!value) {
        await email.fill(buyer.email);
        const next = page.locator('#btnNext, button:has-text("Next")').first();
        if (await visible(next)) await next.click();
        else await email.press("Enter");
        await page.waitForTimeout(800);
        continue;
      }
    }

    if (await visible(password)) {
      const value = await password.inputValue().catch(() => "");
      if (!value) {
        await password.fill(buyer.password);
        const login = page.locator('#btnLogin, button:has-text("Log In"), button:has-text("Log in")').first();
        if (await visible(login)) await login.click();
        else await password.press("Enter");
        await page.waitForTimeout(1_500);
        continue;
      }
    }

    if (await visible(submit)) {
      /* PayPal detaches the button as soon as it accepts the click, so a click
         that navigates away is a success even when Playwright reports a detach */
      await submit.click({ timeout: 8_000 }).catch(() => undefined);
      await page.waitForTimeout(2_000);
      continue;
    }

    /* some sandbox checkouts open on a chooser with an explicit login link */
    const loginLink = page
      .getByRole("link", { name: /log in|login/i })
      .or(page.getByRole("button", { name: /log in|login/i }))
      .first();
    if (await visible(loginLink)) {
      await loginLink.click().catch(() => undefined);
      await page.waitForTimeout(1_000);
      continue;
    }

    if (await clickPaypalControl(page, [/^Continue$/, /^Continue to Payment$/, /^Pay with PayPal$/])) {
      await page.waitForTimeout(1_000);
      continue;
    }

    await page.waitForTimeout(1_000);
  }

  await page.screenshot({ path: path.join(artifactDir, "paypal-stuck.png"), fullPage: true }).catch(() => undefined);
  throw new Error(`PayPal did not return within the window (still at ${page.url()}).`);
}

async function runVisit(page, run) {
  const started = Date.now();
  log(`\nRUN ${run}: landing -> playground`);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const hero = page.getByTestId("hero-playground");
  await hero.waitFor({ state: "visible", timeout: 45_000 });
  await hero.click();
  await waitForPlayground(page);
  log(`  starting vault: ${await statusText(page)}`);

  /* both reserved identities, through the real dashboard and vault room */
  for (const role of ["freelancer", "client"]) {
    await page.getByTestId(`role-${role}`).click();
    await page.waitForFunction(
      (wanted) => document.querySelector(`[data-testid="role-${wanted}"]`)?.getAttribute("aria-selected") === "true",
      role,
      { timeout: 15_000 }
    );
    await page.getByTestId("open-room").click();
    await page.waitForURL(
      (url) => (role === "client" ? url.pathname.startsWith("/vault/") : url.pathname === "/dashboard"),
      { timeout: 45_000 }
    );
    const back = page.getByTestId("playground-switch");
    await back.waitFor({ state: "visible", timeout: 45_000 });
    await back.click();
    await waitForPlayground(page);
    log(`  ${role} room opened and returned`);
  }

  await page.getByTestId("role-client").click();
  await page.waitForTimeout(300);

  log("  loading uncomplete sample");
  await page.getByTestId("load-incomplete").click();
  await waitForChecks(page, "incomplete");
  const failed = await page.getByTestId("playground-failed").textContent();
  log(`  uncomplete checks failed: ${failed}`);

  log("  loading complete sample");
  await page.getByTestId("load-complete").click();
  await waitForChecks(page, "complete");
  log("  complete checks passed");

  log("  opening the real PayPal sandbox order");
  await page.getByTestId("fund-hold").click();
  await page.waitForURL(/paypal\.com/, { timeout: 90_000 });
  await approveAtPaypal(page);

  await page.waitForURL(
    (url) => url.pathname === "/playground/return",
    { timeout: 120_000 }
  );
  await page.waitForURL(
    (url) => url.pathname === "/playground" && url.searchParams.get("funded") === "1",
    { timeout: 120_000 }
  );
  await waitForPlayground(page);
  log(`  after PayPal return: ${await statusText(page)}`);

  const approve = page.getByTestId("approve-capture");
  if (!(await visible(approve))) {
    const note = (await page.getByTestId("playground-error").textContent().catch(() => "")) || "(no error shown)";
    throw new Error(`Capture is not available after funding: ${note} [${await statusText(page)}]`);
  }
  await approve.click();
  await page.waitForFunction(
    () => /paid/i.test(document.querySelector('[data-testid="playground-status"]')?.textContent || ""),
    null,
    { timeout: 90_000 }
  );

  const elapsed = (Date.now() - started) / 1000;
  log(`RUN ${run}: PAID in ${elapsed.toFixed(1)}s`);
  if (elapsed >= LIMIT_SECONDS) throw new Error(`Visit took ${elapsed.toFixed(1)}s, over the ${LIMIT_SECONDS}s budget.`);
  return elapsed;
}

async function reset(page) {
  const before = await page.evaluate(() => {
    const raw = sessionStorage.getItem("vl.playground.session");
    return raw ? JSON.parse(raw).vaultId : null;
  });
  await page.getByTestId("reset-playground").click();
  await page.getByTestId("playground-notice").waitFor({ state: "visible", timeout: 60_000 });
  const notice = (await page.getByTestId("playground-notice").textContent()) || "";
  if (!/reset/i.test(notice)) throw new Error(`Reset did not confirm: ${notice}`);
  const after = await page.evaluate(() => {
    const raw = sessionStorage.getItem("vl.playground.session");
    return raw ? JSON.parse(raw).vaultId : null;
  });
  if (!before || !after || before === after) throw new Error("Reset did not replace the playground vault.");
  await page.waitForFunction(
    () => !/paid|checks complete/i.test(document.querySelector('[data-testid="playground-status"]')?.textContent || ""),
    null,
    { timeout: 30_000 }
  );
  log(`  reset ${before.slice(0, 8)} -> ${after.slice(0, 8)}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
  timezoneId: "America/New_York",
});
const page = await context.newPage();
page.setDefaultTimeout(45_000);

const times = [];
try {
  for (let run = 1; run <= RUNS; run++) {
    times.push(await runVisit(page, run));
    if (run < RUNS) {
      log("  resetting between runs");
      await reset(page);
    }
  }
  log(`\nPASS: ${times.map((seconds, i) => `run ${i + 1} ${seconds.toFixed(1)}s`).join(", ")} (limit ${LIMIT_SECONDS}s)`);
} catch (err) {
  await page.screenshot({ path: path.join(artifactDir, "failure.png"), fullPage: true }).catch(() => undefined);
  log(`\nFAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
