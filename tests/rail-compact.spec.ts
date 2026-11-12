/* rail-compact.spec.ts — the laptop rail must not turn into a drawer.

   Below the wide-desktop breakpoint the rail is a 72px icon strip. Focusing a
   nav item used to widen it to the 233px overlay, covering the dashboard; the
   compact rules must keep the width and keep the labels hidden. */

import { test, expect } from "@playwright/test";

test("the compact rail stays 72px when focused below 1440px", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => {
    Math.random = () => 0.9;
    if (!sessionStorage.getItem("vl.dash.session")) {
      sessionStorage.setItem(
        "vl.dash.session",
        JSON.stringify({ email: "client@northfield.co", role: "client", since: Date.now() })
      );
    }
  });

  await page.goto("/dashboard");
  const rail = page.locator(".dash-rail");
  await expect(rail).toBeVisible();

  /* keep the pointer off the rail so the assertion is about focus-within */
  await page.mouse.move(900, 400);
  const item = rail.locator(".dash-nav-item").first();
  await item.focus();
  await expect(item).toBeFocused();

  /* the compact override has a 382ms width transition */
  await page.waitForTimeout(500);

  const width = await rail.evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBe(72);
  await expect(rail).toHaveCSS("width", "72px");
  await expect(rail.locator(".dash-nav-label").first()).toHaveCSS("opacity", "0");
});
