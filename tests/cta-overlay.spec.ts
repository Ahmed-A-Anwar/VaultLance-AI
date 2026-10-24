/* CTA overlay — access, focus trap, Escape, and the SOLO path. */
import { test, expect } from "@playwright/test";

const CTA = '[data-testid="cta-payoff"]';

/* The landing is now the pinned vault scroll sequence; the CTA lives in the payoff scene.
   This gets the page to the end of the scrub so the payoff scene is active. */
async function toPayoff(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForSelector('[data-testid="vault-sequence"] .vs-cta', { timeout: 15_000 });
}

test("overlay opens from the payoff CTA with three named paths", async ({ page }) => {
  await toPayoff(page);
  await page.locator(CTA).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("text=/solo/i").first()).toBeVisible();
  await expect(dialog.locator("text=/with a friend/i").first()).toBeVisible();
  await expect(dialog.locator("text=/LIVE SANDBOX/i").first()).toBeVisible();
});

test("overlay traps focus and closes on Escape", async ({ page }) => {
  await toPayoff(page);
  await page.locator(CTA).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
    if (!inside) throw new Error(`focus escaped the dialog on Tab ${i + 1}`);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("SOLO path enters the demo without any signup step", async ({ page }) => {
  await toPayoff(page);
  await page.locator(CTA).click();
  await page.getByTestId("demo-solo").click();
  await page.waitForURL(/\/demo/, { timeout: 10_000 });
  // the demo is a seeded state of the real app; it must show a money-state token
  await expect(page.locator("text=/SEALED|HELD|AUDITING|PAID/").first()).toBeVisible();
  // no signup gate between the CTA and the demo
  const gates = await page.locator('button:has-text("Log in"), a:has-text("Sign in"), [data-testid="paypal-gate"]').count();
  expect(gates).toBe(0);
});

test("tab order on the landing reaches the CTA via keyboard", async ({ page }) => {
  await toPayoff(page);
  // inactive stages are not tabbable (visibility hidden), so the armed payoff CTA is hit within a few tabs
  let reached = false;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    if (await page.locator(CTA).first().evaluate((el) => el === document.activeElement)) { reached = true; break; }
  }
  expect(reached, "CTA not reachable within 8 tabs from the payoff").toBe(true);
});
