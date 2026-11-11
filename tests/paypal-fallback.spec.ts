/* paypal-fallback.spec.ts — the client's authorize action must never leave a
   blank card. While the SDK request is pending the fixed slot says "Loading
   PayPal…"; if the request fails it offers a retry instead of collapsing. */

import { test, expect } from "@playwright/test";

const CLIENT = "client@northfield.co";

const VAULT = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "new audit room",
  amount: 133,
  currency: "USD",
  status: "AWAITING_CLIENT",
  createdAt: new Date().toISOString(),
  members: [
    { role: "FREELANCER", fullName: "freelanceorganizer" },
    { role: "CLIENT", email: CLIENT },
  ],
  files: [],
};

test("the PayPal slot shows loading, then a retry, when the SDK is blocked", async ({ page }) => {
  await page.addInitScript((email) => {
    sessionStorage.setItem(
      "vl.dash.session",
      JSON.stringify({ email, role: "client", since: Date.now() })
    );
  }, CLIENT);

  /* hold the SDK request long enough to observe the pending state, then make
     it fail the way an extension or a CSP would */
  await page.route("**/sdk/js**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.abort("failed");
  });

  await page.route("**/api/vaults", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [VAULT] }),
    })
  );
  await page.route("**/api/ledger", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    })
  );

  await page.goto("/dashboard");

  const slot = page.locator(".paypal-btn-wrapper");
  await expect(slot).toBeVisible();
  expect(await slot.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(159);

  await expect(slot.getByRole("status")).toContainText("Loading PayPal…");
  await expect(slot).toContainText("PayPal didn’t load.");
  await expect(slot.getByRole("button", { name: "Retry" })).toBeVisible();
});
