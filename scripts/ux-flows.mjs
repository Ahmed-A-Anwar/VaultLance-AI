#!/usr/bin/env node
/* ux-flows.mjs — walks the first-run, new-freelancer and returning-user flows in
   demo mode (?demo=1), recording steps, clicks, wall time, axe results, page
   titles, tab counts and dead links. No server row is touched. */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

const APP = (process.env.UX_APP || "http://127.0.0.1:5173").replace(/\/+$/, "");
const OUT = path.resolve("docs/ux-audit");
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const evidence = { runAt: new Date().toISOString(), app: APP, flows: {}, axe: {}, pages: {} };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20_000);

const log = (...a) => console.log(...a);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const now = () => Date.now();

async function pageFacts(label) {
  const facts = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector("h1")?.innerText?.trim().slice(0, 120) ?? "",
    h1Count: document.querySelectorAll("h1").length,
    lang: document.documentElement.lang,
    deadLinks: [...document.querySelectorAll('a[href="#"], a[href=""]')].map((a) => a.textContent.trim().slice(0, 40)),
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  evidence.pages[label] = facts;
  return facts;
}

async function axeFor(label) {
  try {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    evidence.axe[label] = r.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
    log(`AXE ${label}: ${evidence.axe[label].length} serious/critical`);
  } catch (e) {
    evidence.axe[label] = [{ id: "axe-error", help: String(e.message).slice(0, 120) }];
  }
}

async function tabsTo(pageRef, match, limit = 25) {
  for (let i = 0; i < limit; i++) {
    await pageRef.keyboard.press("Tab");
    const hit = await pageRef.evaluate((m) => {
      const el = document.activeElement;
      if (!el) return false;
      const text = (el.textContent || el.getAttribute("aria-label") || "").trim();
      return new RegExp(m, "i").test(text);
    }, match);
    if (hit) return i + 1;
  }
  return -1;
}

/* ------------------------------------------------------------------- F1 --- */
async function f1() {
  const f = { name: "F1 judge first visit", steps: [], clicks: 0, startedAt: now() };
  try {
    await page.goto(`${APP}/?demo=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 15_000 });
    f.steps.push("landing loaded");
    const facts = await pageFacts("landing");
    f.steps.push(`h1 "${facts.h1}"`);
    await anchor("f1-01-landing");

    /* keyboard reachability of the first action */
    const tabs = await tabsTo(page, "demo|try|playground|audit|see", 18);
    f.steps.push(`tabs to first action: ${tabs}`);
    f.tabsToAction = tabs;

    const cta =
      page.getByRole("link", { name: /demo|playground|try/i }).first()
        .or(page.getByRole("button", { name: /demo|playground|try/i }).first());
    let navigated = false;
    if (await cta.count()) {
      const label = (await cta.innerText().catch(() => "")) || "";
      f.clicks++;
      await cta.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(600);
      f.steps.push(`clicked "${label.trim()}" → ${new URL(page.url()).pathname}`);
      navigated = true;
      await anchor("f1-02-after-cta");
    }
    if (!navigated) {
      f.steps.push("no demo CTA found; opening /playground directly");
      await page.goto(`${APP}/playground?demo=1`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
    }
    await pageFacts("playground");
    await axeFor("playground");

    /* a demo vault, if the playground offers one */
    const vaultLink = page.getByRole("link", { name: /vault|audit|review/i }).first();
    if (await vaultLink.count()) {
      f.clicks++;
      const href = await vaultLink.getAttribute("href");
      await vaultLink.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(800);
      f.steps.push(`opened ${href}`);
      await shot("f1-03-audit-room");
    } else {
      f.steps.push("playground lists no vault link");
    }
    await pageFacts("audit-room");
  } catch (e) {
    f.error = String(e.message).slice(0, 200);
    f.steps.push(`ERROR ${f.error}`);
    await shot("f1-error").catch(() => {});
  }
  f.seconds = Math.round((now() - f.startedAt) / 100) / 10;
  evidence.flows.F1 = f;
  log(`F1 ${f.error ? "ERROR" : "done"} ${f.seconds}s, ${f.clicks} clicks`);
}

/* ------------------------------------------------------------------- F2 --- */
async function f2() {
  const f = { name: "F2 new freelancer", steps: [], clicks: 0, startedAt: now() };
  const email = `ux-${Date.now()}-demo@example.com`;
  try {
    await page.goto(`${APP}/signup?demo=1`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("role-freelancer").click();
    f.clicks++;
    await page.locator("#signup-name").waitFor({ state: "visible" });
    const facts = await pageFacts("signup");
    f.steps.push(`signup form, lang ${facts.lang}, title "${facts.title}"`);

    await page.locator("#signup-name").fill("Ada Fielding");
    await page.locator("#signup-email").fill(email);
    await page.locator("#signup-password").fill("Vp-Ux-Passw0rd!");
    await page.locator("#signup-paypal").fill("ada@example.test");
    const t = now();
    await page.getByTestId("signup-submit").click();
    await page
      .waitForFunction(
        () => /Your freelancer vault is open|isn.t valid|already|try again|went wrong/i.test(document.body.innerText),
        { timeout: 20_000 }
      )
      .catch(() => {});
    f.submitMs = now() - t;
    f.clicks++;
    const afterSubmit = await page.locator("body").innerText();
    f.signedUp = /Your freelancer vault is open/i.test(afterSubmit);
    f.bodyAfterSubmit = afterSubmit.replace(/\s+/g, " ").slice(0, 300);
    f.steps.push(`signup ${f.signedUp ? "success" : "did not reach success"} in ${f.submitMs}ms`);
    await shot("f2-01-signed-up");

    const dash = page.getByRole("link", { name: /dashboard/i }).first();
    if (f.signedUp && (await dash.count())) {
      await dash.click();
      f.clicks++;
      await page.waitForURL(/dashboard/, { timeout: 20_000 });
      await page.waitForTimeout(1200);
      f.steps.push("reached dashboard");
      await pageFacts("freelancer-dashboard");
      await axeFor("freelancer-dashboard");
      await shot("f2-02-dashboard");

      /* the first action on the dashboard: create a vault */
      const first = now();
      const newVault = page.getByRole("button", { name: /new vault/i }).first();
      if (await newVault.count()) {
        await newVault.click();
        f.clicks++;
        await page.getByRole("dialog").waitFor({ state: "visible", timeout: 10_000 });
        f.drawerOpenMs = now() - first;
        f.steps.push(`drawer opened in ${f.drawerOpenMs}ms`);
        await shot("f2-03-drawer");
      }
    }
    await pageFacts("freelancer-dashboard");
  } catch (e) {
    f.error = String(e.message).slice(0, 200);
    f.steps.push(`ERROR ${f.error}`);
    await shot("f2-error").catch(() => {});
  }
  f.seconds = Math.round((now() - f.startedAt) / 100) / 10;
  evidence.flows.F2 = f;
  log(`F2 ${f.error ? "ERROR" : "done"} ${f.seconds}s, ${f.clicks} clicks`);
}

/* ------------------------------------------------------------------- F4 --- */
async function f4() {
  const f = { name: "F4 returning user", steps: [], clicks: 0, startedAt: now() };
  try {
    /* demo mode seeds a session, so the returning-user flow starts at /signin */
    await page.goto(`${APP}/signin?demo=1`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const landed = new URL(page.url()).pathname;
    f.steps.push(`signin route → ${landed}`);
    if (landed !== "/dashboard") {
      const f2Facts = await pageFacts("signin-redirect");
      f.steps.push(`signin h1 "${f2Facts.h1}"`);
      await axeFor("signin");
      await shot("f4-01-signin");

      /* sign in with the demo session */
      const email = page.locator("#signin-email");
      if (await email.count()) {
        await email.fill("freelancer@vaultlance.ai");
        await page.locator("#signin-password").fill("demo-password");
        const t = now();
        await page.getByTestId("signin-submit").click().catch(() => page.keyboard.press("Enter"));
        f.clicks++;
        await page.waitForURL(/dashboard/, { timeout: 20_000 }).catch(() => {});
        f.signinMs = now() - t;
        f.steps.push(`sign-in to dashboard in ${f.signinMs}ms`);
        await page.waitForTimeout(1200);
        await shot("f4-02-dashboard");
        await pageFacts("freelancer-dashboard-returning");
        await axeFor("freelancer-dashboard-returning");
      }
    }
    /* how long to the first actionable element */
    const firstAction = await page
      .evaluate(() => {
        const el = document.querySelector(".dash-cta-primary, .dash-btn-primary, .fd-btn-primary, [data-primary]");
        return el ? el.textContent.trim().slice(0, 40) : "";
      })
      .catch(() => "");
    f.steps.push(`first action: ${firstAction || "none found"}`);
    f.firstAction = firstAction;
  } catch (e) {
    f.error = String(e.message).slice(0, 200);
    f.steps.push(`ERROR ${f.error}`);
    await shot("f4-error").catch(() => {});
  }
  f.seconds = Math.round((now() - f.startedAt) / 100) / 10;
  evidence.flows.F4 = f;
  log(`F4 ${f.error ? "ERROR" : "done"} ${f.seconds}s, ${f.clicks} clicks`);
}

async function anchor(name) {
  await shot(name).catch(() => {});
}

try {
  await f1();
  await f2();
  await f4();
} finally {
  fs.writeFileSync(path.join(OUT, "evidence", "flows.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await browser.close().catch(() => {});
}
