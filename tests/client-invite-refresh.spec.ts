/* client-invite-refresh.spec.ts — a client's open dashboard must see a vault
   that was invited after the page loaded. The empty list is the case that used
   to stop the poller entirely, leaving the invitation invisible until reload. */

import { test, expect } from "@playwright/test";

const CLIENT = "client@northfield.co";

const NEW_VAULT = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Newly invited project",
  amount: 250,
  currency: "USD",
  status: "AWAITING_CLIENT",
  createdAt: new Date().toISOString(),
  members: [
    { role: "FREELANCER", fullName: "Freelancer" },
    { role: "CLIENT", email: CLIENT },
  ],
  files: [],
};

test("a new client invitation appears without a reload", async ({ page }) => {
  await page.addInitScript((email) => {
    sessionStorage.setItem(
      "vl.dash.session",
      JSON.stringify({ email, role: "client", since: Date.now() })
    );
  }, CLIENT);

  let invited = false;

  await page.route("**/api/vaults", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: invited ? [NEW_VAULT] : [] }),
    });
  });

  await page.route("**/api/ledger", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.goto("/dashboard");
  await expect(page.getByText("No vaults yet")).toBeVisible();
  await expect(page.locator(".dash-toast")).toHaveCount(0);

  /* another device creates the vault and invites this client; focusing the
     dashboard should refresh it immediately, without page.reload() */
  invited = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.locator(".dash-vault-project")).toHaveText("Newly invited project");
  await expect(page.locator(".dash-toast-text")).toContainText("New vault: Newly invited project.");
  await expect(page.getByText("No vaults yet")).toHaveCount(0);
});

test("the idle poll announces a newly invited vault without focus or reload", async ({ page }) => {
  test.setTimeout(45_000);
  await page.addInitScript((email) => {
    sessionStorage.setItem(
      "vl.dash.session",
      JSON.stringify({ email, role: "client", since: Date.now() })
    );
  }, CLIENT);

  let invited = false;

  await page.route("**/api/vaults", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: invited ? [NEW_VAULT] : [] }),
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
  await expect(page.getByText("No vaults yet")).toBeVisible();
  await expect(page.locator(".dash-toast")).toHaveCount(0);

  /* Nothing is focused or reloaded here: this is the scheduled idle poll. */
  const started = Date.now();
  invited = true;
  await expect(page.locator(".dash-toast-text")).toContainText("New vault: Newly invited project.", {
    timeout: 25_000,
  });
  const noticeMs = Date.now() - started;
  console.log(`[live] idle poll notice in ${noticeMs}ms`);
  expect(noticeMs).toBeLessThan(25_000);
  await expect(page.locator(".dash-vault-project")).toHaveText("Newly invited project");
});
