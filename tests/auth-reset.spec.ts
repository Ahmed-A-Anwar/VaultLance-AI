/* auth-reset.spec.ts — the forgot/reset flow, driven the way a visitor drives it.
   The 5% sandbox failure is pinned away (Math.random fixed high) except where a
   test wants it. */

import { test, expect } from "@playwright/test";

const FORGOT = "/forgot-password";
const reset = (token: string) => `/reset-password?token=${token}`;
const STRONG = "Aa1!aaaaaaaa"; // 12 characters: length, case, digit, symbol, 12+

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.9;
  });
});

test("1. sign in → forgot → sent → the mock link opens the reset screen", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("signin-forgot").click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  await page.locator("#forgot-email").fill("a@b.co");
  await page.getByTestId("forgot-submit").click();

  await expect(page.getByTestId("forgot-sent")).toBeVisible();
  await expect(page.getByTestId("forgot-sent")).toContainText("a@b.co");
  await expect(page.getByTestId("forgot-h1")).toHaveText("Check your inbox.");

  await page.getByTestId("dev-reset-link").click();
  await expect(page).toHaveURL(/\/reset-password\?token=demo-valid$/);
  await expect(page.getByTestId("reset-h1")).toHaveText("Set a new code.");
});

test("2. a strong code shuts all five bolts, succeeds, then redirects to /signin", async ({ page }) => {
  await page.goto(reset("demo-valid"));
  await page.locator("#reset-password").fill(STRONG);

  await expect(page.getByTestId("strength-label")).toHaveText("STRONG");
  await expect(page.locator('.auth-bolt[data-on="1"]')).toHaveCount(5);

  await page.locator("#reset-confirm").fill(STRONG);
  await page.getByTestId("reset-submit").click();

  await expect(page.getByTestId("reset-success")).toBeVisible({ timeout: 6000 });
  await expect(page.getByTestId("reset-h1")).toHaveText("Vault re-secured.");
  await page.waitForURL(/\/signin$/, { timeout: 8000 });
});

test("3. a weak code keeps the submit shut and names what is missing", async ({ page }) => {
  await page.goto(reset("demo-valid"));
  await page.locator("#reset-password").fill("aaaaaaaa");
  await page.locator("#reset-confirm").fill("aaaaaaaa");

  await expect(page.getByTestId("strength-label")).toHaveText("WEAK");
  await expect(page.locator('.auth-bolt[data-on="1"]')).toHaveCount(1);
  await expect(page.getByTestId("reset-submit")).toBeDisabled();

  await expect(page.locator('.auth-req[data-met="1"]')).toHaveCount(1);
  await expect(page.locator('.auth-req[data-met="0"]')).toHaveCount(2);
});

test("4. an expired and an unknown token each dead-end on their own card", async ({ page }) => {
  await page.goto(reset("demo-expired"));
  await expect(page.getByTestId("reset-h1")).toHaveText("This link has expired.");
  await expect(page.getByTestId("reset-request")).toBeVisible();

  await page.goto(reset("foo"));
  await expect(page.getByTestId("reset-h1")).toHaveText("This link isn\u2019t valid.");
  await expect(page.getByTestId("reset-request")).toBeVisible();
});

test("5. resend is held for 55s, counts down, then comes back", async ({ page }) => {
  await page.clock.install();
  await page.goto(FORGOT);
  await page.locator("#forgot-email").fill("a@b.co");
  await page.getByTestId("forgot-submit").click();
  await page.clock.runFor(1000);

  const resend = page.getByTestId("sent-resend");
  await expect(resend).toBeVisible();
  await expect(resend).toBeDisabled();
  await expect(resend).toContainText("RESEND IN 55");

  await page.clock.runFor(2000);
  await expect(resend).toContainText("RESEND IN 53");

  await page.clock.runFor(53_000);
  await expect(resend).toBeEnabled();
  await expect(resend).toContainText("RESEND LINK");
});

test("6. a registered and an unregistered address read the same", async ({ page }) => {
  for (const address of ["registered@vault.test", "nobody@vault.test"]) {
    await page.goto(FORGOT);
    await page.locator("#forgot-email").fill(address);
    await page.getByTestId("forgot-submit").click();

    const sent = page.getByTestId("forgot-sent");
    await expect(sent).toBeVisible();
    await expect(sent).toContainText(address);
    await expect(sent).not.toContainText(/no account|not found|unknown/i);
  }
});

test("7. direct loads render final, and the vault is never remounted", async ({ page }) => {
  await page.goto(FORGOT);
  const heading = page.getByTestId("forgot-h1");
  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS("opacity", "1");

  /* a mark on the vault's canvas: it can only survive if the node survives */
  await page.evaluate(() => {
    const canvas = document.querySelector(".hero-canvas");
    if (canvas instanceof HTMLElement) canvas.dataset.mark = "kept";
  });

  const anchor = () =>
    page.evaluate(() => getComputedStyle(document.querySelector(".vault-shift") as Element).getPropertyValue("--vault-x").trim());

  expect(await anchor()).toBe("76.4");

  await page.getByTestId("auth-back").click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.locator('.hero-canvas[data-mark="kept"]')).toHaveCount(1);
  expect(await anchor()).toBe("76.4");

  await page.goBack();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByTestId("forgot-h1")).toBeVisible();
  await expect(page.locator('.hero-canvas[data-mark="kept"]')).toHaveCount(1);
  expect(await anchor()).toBe("76.4");
});

test("8. a valid address typed on /signin rides across", async ({ page }) => {
  await page.goto("/signin");
  await page.locator("#signin-email").fill("carry@vault.test");
  await page.getByTestId("signin-forgot").click();
  await expect(page.locator("#forgot-email")).toHaveValue("carry@vault.test");
});

test("9. the whole flow can be walked from the keyboard", async ({ page }) => {
  await page.goto(FORGOT);

  await page.locator("#forgot-email").focus();
  await page.keyboard.type("keyboard@vault.test");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("forgot-sent")).toBeVisible();

  /* the sent state puts focus on the H1, so the next tabs reach the dev link */
  await expect(page.getByTestId("forgot-h1")).toBeFocused();
  await page.getByTestId("dev-reset-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("reset-h1")).toHaveText("Set a new code.");

  await page.locator("#reset-password").focus();
  await page.keyboard.type(STRONG);
  /* the show/hide control sits between the two fields in the tab order */
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator("#reset-confirm")).toBeFocused();
  await page.keyboard.type(STRONG);
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("reset-success")).toBeVisible({ timeout: 6000 });
});

test("10. the mock's 5% failure is reachable and says so", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto(FORGOT);
  await page.locator("#forgot-email").fill("a@b.co");
  await page.getByTestId("forgot-submit").click();

  await expect(page.getByTestId("forgot-failure")).toHaveText("Couldn't send. Try again.");
  await expect(page.getByTestId("forgot-submit")).toBeEnabled();
});

test("11. reduced motion: the same states, none of the movement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(reset("demo-valid"));
  await page.locator("#reset-password").fill(STRONG);
  await expect(page.getByTestId("strength-label")).toHaveText("STRONG");
  await expect(page.locator('.auth-bolt[data-on="1"]')).toHaveCount(5);
  await expect(page.locator(".auth-icon .auth-draw")).toHaveCount(0);
});
