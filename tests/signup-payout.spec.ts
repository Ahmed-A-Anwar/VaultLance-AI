/* signup-payout.spec.ts — the PayPal address a freelancer types at signup is
   part of the account, not a field the register call drops: the payout profile
   reads it back, and Settings shows it VERIFIED without anyone visiting the
   page to enter it again. */

import { test, expect } from "@playwright/test";

const PAYOUT = "signup.payout@paypal.example";

test("a freelancer's signup payout email reaches the payout profile", async ({ page }) => {
  await page.goto("/signup?demo=1");
  await page.getByTestId("role-freelancer").click();
  await expect(page.locator("#signup-name")).toBeVisible();

  await page.locator("#signup-name").fill("Payout Regression");
  await page.locator("#signup-email").fill(`signup-payout-${Date.now()}@example.test`);
  await page.locator("#signup-password").fill("Vp-Regression-1!");
  await page.locator("#signup-paypal").fill(PAYOUT);
  await page.getByTestId("signup-submit").click();

  await expect(page.locator(".signup-done-h")).toHaveText(/vault is open/i);

  /* the profile, not just the form's own state, carries the address */
  const stored = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("vl.settings") || "{}").payoutEmail
  );
  expect(stored).toBe(PAYOUT);

  await page.goto("/dashboard/settings?demo=1");
  await expect(page.getByTestId("profile-paypal")).toHaveValue(PAYOUT);
  await expect(page.getByTestId("payout-status-chip")).toHaveText("VERIFIED");
});
