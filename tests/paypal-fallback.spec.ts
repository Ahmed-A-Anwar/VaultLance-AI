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
  await expect(slot.getByRole("button", { name: "Open PayPal" })).toBeVisible();
  await expect(slot.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("the card offers direct checkout when PayPal renders no button", async ({ page }) => {
  test.setTimeout(20_000);
  await page.addInitScript((email) => {
    sessionStorage.setItem(
      "vl.dash.session",
      JSON.stringify({ email, role: "client", since: Date.now() })
    );
  }, CLIENT);

  await page.route("**/sdk/js**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.paypal = {
          Buttons: function () {
            return {
              isEligible: function () { return false; },
              close: function () { return Promise.resolve(); },
              render: function () { return Promise.resolve(); }
            };
          }
        };
      `,
    })
  );
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
  await page.route("**/api/vaults/*/payment/order", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          orderId: "ORDER-1",
          links: [
            {
              rel: "payer-action",
              href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1",
            },
          ],
        },
      }),
    })
  );
  await page.route("https://www.sandbox.paypal.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>PayPal checkout</body></html>" })
  );

  await page.goto("/dashboard");
  const slot = page.locator(".paypal-btn-wrapper");
  await expect(slot).toContainText("Opening PayPal…");
  const direct = slot.getByRole("button", { name: "Open PayPal" });
  await expect(direct).toBeVisible({ timeout: 12_000 });

  await direct.click();
  await expect.poll(() => page.url(), { timeout: 5_000 }).toContain("sandbox.paypal.com/checkoutnow");
});
