#!/usr/bin/env node
/* ux-f6-account.mjs — the account's own surfaces, demo mode: edit the profile,
   change the password (wrong then right), see sessions, hit the delete blockers,
   and sign out. No server row is written. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const APP = (process.env.UX_APP || "http://127.0.0.1:5173").replace(/\/+$/, "");
const OUT = path.resolve("docs/ux-audit");
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.join(OUT, "evidence"), { recursive: true });

const browser = await chromium.launch({ headless: true });
const out = { steps: [], friction: [] };

async function context(email, role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(({ email, role }) => {
    Math.random = () => 0.9;
    /* seed once per context: re-seeding on every document would resurrect the
       session the sign-out just cleared */
    if (!localStorage.getItem("ux.f6.seeded")) {
      sessionStorage.setItem("vl.dash.session", JSON.stringify({ email, role, since: Date.now() }));
      localStorage.setItem("vl_demo_mode", "true");
      localStorage.setItem("ux.f6.seeded", "1");
    }
  }, { email, role });
  return ctx;
}

const text = async (page, sel) => (await page.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const step = (s) => { out.steps.push(s); console.log(s); };

try {
  /* ---- delete blockers, on the freelancer's seeded vaults ---------------- */
  {
    const ctx = await context("freelancer@vaultlance.ai", "freelancer");
    const page = await ctx.newPage();
    page.setDefaultTimeout(12_000);
    await page.goto(`${APP}/dashboard/settings?demo=1`);
    await page.getByTestId("account-summary").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /^Delete account$/i }).click();
    const modal = page.getByTestId("delete-modal");
    await modal.waitFor({ state: "visible" });
    await modal.getByText(/finish or resolve these vaults first/i).waitFor({ state: "visible", timeout: 12_000 });
    out.delete = {
      blockerHeading: await text(page, ".set-blocked-h"),
      blockerSub: await text(page, ".set-block-sub"),
      blockers: await page.locator(".set-blocked-list li").count(),
      links: await page.locator(".set-blocked-list a").evaluateAll((els) => els.map((e) => e.getAttribute("href"))),
      hasEmailField: (await page.getByTestId("delete-email").count()) > 0,
    };
    step(`delete blocked: "${out.delete.blockerHeading}" (${out.delete.blockers} vaults, no email field: ${!out.delete.hasEmailField})`);
    if (out.delete.hasEmailField) out.friction.push("delete offers a confirmation field while blockers exist");
    await page.screenshot({ path: path.join(SHOTS, "f6-01-delete-blocked.png") });
    /* the way out: each blocker is a link to the vault */
    await page.locator(".set-blocked-list a").first().click();
    await page.waitForURL(/\/dashboard\/vaults/, { timeout: 10_000 });
    out.delete.recovery = page.url().replace(APP, "");
    step(`blocker link recovers to ${out.delete.recovery}`);
    await ctx.close();
  }

  /* ---- profile, password, sessions, sign out (client) ------------------- */
  {
    const ctx = await context("client@northfield.co", "client");
    const page = await ctx.newPage();
    page.setDefaultTimeout(12_000);
    await page.goto(`${APP}/dashboard/settings?demo=1`);
    await page.getByTestId("account-summary").waitFor({ state: "visible" });

    /* profile */
    await page.getByTestId("profile-name").fill("Amira Hassan");
    await page.getByTestId("profile-save").click();
    await page.locator(".dash-toast-text", { hasText: "Profile saved." }).waitFor({ state: "visible" });
    out.profile = {
      summary: await text(page, '[data-testid="summary-name"]'),
      chrome: await text(page, ".dash-user-name"),
    };
    step(`profile saved: summary "${out.profile.summary}", chrome "${out.profile.chrome}"`);

    /* password: wrong, then right */
    await page.locator("#pw-current").fill("wrong");
    await page.locator("#pw-new").fill("Aa1!aaaaaaaa");
    await page.locator("#pw-confirm").fill("Aa1!aaaaaaaa");
    await page.getByTestId("pw-update").click();
    await page.locator("#pw-current-err").waitFor({ state: "visible" });
    out.passwordWrong = await text(page, "#pw-current-err");
    step(`wrong current password: "${out.passwordWrong}"`);

    out.sessionsBefore = await page.locator('[data-testid^="session-"]').count();
    await page.locator("#pw-current").fill("right");
    await page.getByTestId("pw-update").click();
    await page.locator(".dash-toast-text", { hasText: "Password updated." }).waitFor({ state: "visible" });
    /* the revoked rows leave on a 1.618s beat, after the toast */
    await page.waitForTimeout(2400);
    out.sessionsAfter = await page.locator('[data-testid^="session-"]').count();
    out.currentStillThere = (await page.getByTestId("session-s_this").count()) > 0;
    step(`password updated: sessions ${out.sessionsBefore} → ${out.sessionsAfter}, current kept: ${out.currentStillThere}`);
    if (out.sessionsAfter >= out.sessionsBefore) out.friction.push("changing the password did not revoke the other sessions");
    await page.screenshot({ path: path.join(SHOTS, "f6-02-account.png") });

    /* sign out */
    await page.getByRole("button", { name: /^Sign out$/i }).first().click();
    /* sign-out lands on the instrument, not the sign-in form */
    await page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 10_000 });
    out.signOut = { landed: new URL(page.url()).pathname };
    await page.goto(`${APP}/dashboard`);
    await page.waitForTimeout(1200);
    out.signOut.guardedTo = new URL(page.url()).pathname;
    out.signOut.sessionCleared = await page.evaluate(() => !sessionStorage.getItem("vl.dash.session"));
    step(`signed out → ${out.signOut.landed}; /dashboard → ${out.signOut.guardedTo}; session cleared: ${out.signOut.sessionCleared}`);
    if (out.signOut.guardedTo !== "/signin") out.friction.push("a signed-out dashboard visit did not return to sign-in");
    await page.screenshot({ path: path.join(SHOTS, "f6-03-signed-out.png") });
    await ctx.close();
  }
} catch (e) {
  out.error = String(e.message).slice(0, 240);
  console.log("ERROR", out.error);
}

fs.writeFileSync(path.join(OUT, "evidence", "f6-account.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log("\nFRICTION:", out.friction.length ? out.friction : "none");
await browser.close();
