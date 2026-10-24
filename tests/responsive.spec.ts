/* Responsive — the 320px bar: nothing scrolls the page horizontally. */
import { test, expect } from "@playwright/test";

const ROUTES = ["/", "/console", "/vault/new"];

for (const route of ROUTES) {
  test(`no horizontal overflow at 320px on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(route);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow, `page ${route} overflows horizontally by ${overflow}px at 320`).toBeLessThanOrEqual(0);
  });
}

test("landing payoff CTA stays reachable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  const cta = page.locator('button:has-text("Put it to Test")');
  await expect(cta.first()).toBeVisible();
  await expect(cta.first()).toBeEnabled();
});
