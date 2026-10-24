/* Reduced motion — staged landing stays readable and the CTA works. */
import { test, expect } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

async function toPayoff(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForSelector('[data-testid="vault-sequence"] .vs-cta', { timeout: 15_000 });
}

test("reduced-motion fallback renders two static frames and stacked captions", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-testid="vault-sequence"] .vs-fallback-stack')).toBeVisible();
  await expect(page.locator('[data-testid="vault-sequence"] .vs-fallback-frames img').first()).toBeVisible();
  await expect(page.locator('[data-testid="vault-sequence"] .vs-fallback-frames img').last()).toBeVisible();
  await expect(page.locator('[data-testid="vault-sequence"] .vs-scene-static').first()).toBeVisible();
});

test("CTA is operable under reduced motion", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-testid="vault-sequence"] [data-testid="cta-payoff"]')).toBeHidden();
  await toPayoff(page);
  const cta = page.locator('[data-testid="cta-payoff"]');
  await expect(cta).toBeEnabled();
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("caption scenes render in order and the last is the payoff", async ({ page }) => {
  await page.goto("/");
  const scenes = page.locator('[data-testid="vault-sequence"] .vs-scene-static');
  await expect(scenes).toHaveCount(6);
  await expect(scenes.last()).toContainText(/Put it to Test/);
});
