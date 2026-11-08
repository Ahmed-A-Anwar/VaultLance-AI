/* signup-payout.spec.ts — the PayPal address a freelancer types at signup is
   part of the account, not a field the register call drops: the payout profile
   reads it back, Settings shows it VERIFIED without anyone visiting that page,
   and the Overview banner and Payments card agree in the same document. */

import { test, expect, type Page } from "@playwright/test";

const PAYOUT = "signup.payout@paypal.example";

async function signupAsFreelancer(page: Page) {
  /* the shell links drop the query string, so keep the demo session across
     in-app navigation the way a real signed-in session needs no flag at all */
  await page.addInitScript(() => localStorage.setItem("vl_demo_mode", "true"));
  await page.goto("/signup?demo=1");
  await page.getByTestId("role-freelancer").click();
  await expect(page.locator("#signup-name")).toBeVisible();

  await page.locator("#signup-name").fill("Payout Regression");
  await page.locator("#signup-email").fill(`signup-payout-${Date.now()}@example.test`);
  await page.locator("#signup-password").fill("Vp-Regression-1!");
  await page.locator("#signup-paypal").fill(PAYOUT);
  await page.getByTestId("signup-submit").click();

  await expect(page.locator(".signup-done-h")).toHaveText(/vault is open/i);
}

test("a freelancer's signup payout email reaches the payout profile", async ({ page }) => {
  await signupAsFreelancer(page);

  /* the profile, not just the form's own state, carries the address */
  const stored = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("vl.settings") || "{}").payoutEmail
  );
  expect(stored).toBe(PAYOUT);

  await page.goto("/dashboard/settings?demo=1");
  await expect(page.getByTestId("profile-paypal")).toHaveValue(PAYOUT);
  await expect(page.getByTestId("payout-status-chip")).toHaveText("VERIFIED");
});

test("the Overview banner and Payments card read it without a reload", async ({ page }) => {
  await signupAsFreelancer(page);

  await page.getByRole("link", { name: "Go to Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator(".fd-banner")).toHaveCount(0);

  /* a window marker dies on reload, so it proves the card was reached in-place */
  await page.evaluate(() => ((window as Window & { __sameDocument?: boolean }).__sameDocument = true));
  await page.getByRole("link", { name: /^Payments$/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/payments/);
  await expect(page.locator(".pay-method-mail").first()).toHaveText(PAYOUT);
  expect(await page.evaluate(() => (window as Window & { __sameDocument?: boolean }).__sameDocument)).toBe(true);
});
