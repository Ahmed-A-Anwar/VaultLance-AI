/* settings.spec.ts — /dashboard/settings, driven the way a client drives it.
   The sandbox's 5% failure is pinned away (Math.random fixed high) so a flow
   tests the flow, not the coin. */

import { test, expect, type Page } from "@playwright/test";

const EMAIL = "client@northfield.co";
const SETTINGS = "/dashboard/settings";

/* a signed-in client, and a deterministic mock */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.9;
    /* only seed it: a later document (a reload, a navigation) must see what the
       app wrote, including the name a save just added */
    if (!sessionStorage.getItem("vl.dash.session")) {
      sessionStorage.setItem(
        "vl.dash.session",
        JSON.stringify({ email: "client@northfield.co", role: "client", since: Date.now() })
      );
    }
  });
});

const open = async (page: Page, path = SETTINGS) => {
  await page.goto(path);
  await expect(page.getByTestId("account-summary")).toBeVisible();
};

test("1. a name edit dirties the card; discard resets, save updates the chip and greeting", async ({ page }) => {
  await open(page);
  const name = page.getByTestId("profile-name");
  await expect(name).toHaveValue("Client");

  await name.fill("Amira Hassan");
  await expect(page.locator("#profile .set-dirty")).toHaveAttribute("data-show", "1");

  await page.locator("#profile").getByRole("button", { name: "Discard" }).click();
  await expect(name).toHaveValue("Client");
  await expect(page.locator("#profile .set-dirty")).toHaveAttribute("data-show", "0");

  await name.fill("Amira Hassan");
  await page.getByTestId("profile-save").click();

  await expect(page.locator(".dash-toast-text", { hasText: "Profile saved." })).toBeVisible();
  await expect(page.getByTestId("summary-name")).toHaveText("Amira Hassan");
  await expect(page.locator(".dash-user-name")).toHaveText("Amira Hassan");

  /* the greeting reads the same name, not the address */
  await page.goto("/dashboard");
  await expect(page.locator(".dash-greeting-h")).toContainText("Amira");
});

test("2. mute all turns every switch off in a stagger, and the save survives a reload", async ({ page }) => {
  await open(page);

  const first = page.getByTestId("notif-payment_authorized-email");
  await expect(first).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("notif-mute").click();
  await expect(page.getByTestId("notif-mute")).toHaveText("Unmute all");
  await expect(page.locator('.set-switch[data-on="1"]')).toHaveCount(0);

  /* the domino is a per-switch transition delay, not a lucky frame */
  const delay = await page
    .getByTestId("notif-hold_voided-email")
    .evaluate((el) => getComputedStyle(el).transitionDelay);
  expect(delay).not.toBe("0s");

  await page.getByTestId("notif-save").click();
  await expect(page.locator(".dash-toast-text", { hasText: "Notifications saved." })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("notif-payment_authorized-email")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("notif-mute")).toHaveText("Unmute all");
});

test("3. the password rules gate the button, a wrong current password shakes, a right one succeeds", async ({ page }) => {
  await open(page);

  await page.locator("#pw-current").fill("wrong");
  await page.locator("#pw-new").fill("Aa1!aaaaaaaa");
  await expect(page.getByTestId("strength-label")).toHaveText("STRONG");
  await page.locator("#pw-confirm").fill("Aa1!aaaaaaaa");

  /* watch the class rather than sample it: the shake lasts 0.382s */
  await page.evaluate(() => {
    const card = document.querySelector("#security") as HTMLElement;
    (window as unknown as { __shook: boolean }).__shook = false;
    new MutationObserver(() => {
      if (card.classList.contains("is-shake")) (window as unknown as { __shook: boolean }).__shook = true;
    }).observe(card, { attributes: true, attributeFilter: ["class"] });
  });

  await page.getByTestId("pw-update").click();
  await expect(page.locator("#pw-current-err")).toHaveText("Current password is wrong.");
  expect(await page.evaluate(() => (window as unknown as { __shook: boolean }).__shook)).toBe(true);

  await page.locator("#pw-current").fill("right");
  await page.getByTestId("pw-update").click();
  await expect(page.locator(".dash-toast-text", { hasText: "Password updated." })).toBeVisible();

  /* the mock revokes the other devices, and the current one stays */
  await expect(page.getByTestId("session-s_iphone")).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByTestId("session-s_this")).toBeVisible();

  /* a weak new password cannot submit */
  await page.locator("#pw-current").fill("right");
  await page.locator("#pw-new").fill("aaaaaaaa");
  await page.locator("#pw-confirm").fill("aaaaaaaa");
  await expect(page.getByTestId("pw-update")).toBeDisabled();
});

test("4. two-factor: a wrong code is refused, 123456 arms it, turning it off takes two clicks", async ({ page }) => {
  await open(page);

  await page.getByTestId("mfa-switch").click();
  const modal = page.getByTestId("mfa-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByTestId("mfa-secret")).toHaveText("DEMO-2FA-KEY");

  const boxes = modal.locator(".set-otp-box");
  await boxes.first().click();
  await page.keyboard.type("000000");
  await page.getByTestId("mfa-confirm").click();
  await expect(page.getByTestId("mfa-code-err")).toHaveText("Code didn't match.");

  await boxes.first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("123456");
  await page.getByTestId("mfa-confirm").click();

  await expect(modal).toBeHidden({ timeout: 5000 });
  await expect(page.getByTestId("mfa-switch")).toHaveAttribute("aria-checked", "true");

  /* off is a two-step, and the first click only asks */
  await page.getByTestId("mfa-switch").click();
  const off = page.getByTestId("mfa-off");
  await expect(off).toBeVisible();
  await off.click();
  await expect(off).toContainText("Click again");
  await expect(page.getByTestId("mfa-switch")).toHaveAttribute("aria-checked", "true");
  await off.click();
  await expect(page.getByTestId("mfa-switch")).toHaveAttribute("aria-checked", "false", { timeout: 4000 });
});

test("5. a session revoke takes two clicks, and this device has no revoke", async ({ page }) => {
  await open(page);

  await expect(page.getByTestId("session-s_this").getByRole("button", { name: /revoke/i })).toHaveCount(0);
  await expect(page.getByTestId("session-s_this")).toContainText("THIS DEVICE");

  const revoke = page.getByTestId("revoke-s_iphone");
  await revoke.click();
  await expect(revoke).toContainText("Confirm revoke");
  await expect(page.getByTestId("session-s_iphone")).toBeVisible();

  await revoke.click();
  await expect(page.getByTestId("session-s_iphone")).toHaveCount(0, { timeout: 4000 });
  await expect(page.getByTestId("session-s_mac")).toBeVisible();
});

test("6. delete is blocked by a held vault; with none, the email and the hold are required", async ({ page }) => {
  await open(page);

  await page.getByTestId("delete-open").click();
  const modal = page.getByTestId("delete-modal");
  await expect(modal).toBeVisible();
  await expect(modal.getByText("Resolve these vaults first.")).toBeVisible();
  await expect(modal.getByRole("link", { name: /Logo Pack/ })).toHaveAttribute("href", "/vault/v_logo_pack");
  await expect(modal.getByTestId("delete-email")).toHaveCount(0);

  await modal.getByRole("button", { name: "Close" }).click();

  /* no vaults: the delete control exists, but only after the address matches */
  await open(page, `${SETTINGS}?empty=1`);
  await page.getByTestId("delete-open").click();
  await expect(page.getByTestId("delete-email")).toBeVisible();

  const hold = page.getByRole("button", { name: "Hold to delete" });
  await expect(hold).toBeDisabled();
  await page.getByTestId("delete-email").fill(EMAIL);
  await expect(hold).toBeEnabled();

  /* release early: nothing happens */
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(page.getByTestId("delete-modal")).toBeVisible();

  /* hold it home */
  await page.mouse.down();
  await page.waitForTimeout(1900);
  await page.mouse.up();
  await expect(page).toHaveURL(/\/$/, { timeout: 6000 });
});

test("7. a dirty card asks before an in-app navigation leaves the page", async ({ page }) => {
  await open(page);
  await page.getByTestId("profile-name").fill("Half Typed");

  await page.locator('.dash-rail a[href="/dashboard/vaults"]').click();
  await expect(page.getByTestId("unsaved-modal")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/settings/);

  await page.getByTestId("keep-editing").click();
  await expect(page.getByTestId("unsaved-modal")).toBeHidden();
  await expect(page.getByTestId("profile-name")).toHaveValue("Half Typed");

  /* a section change is a scroll, not a navigation, so it must not ask */
  await page.getByTestId("settings-nav-security").click();
  await expect(page.getByTestId("unsaved-modal")).toBeHidden();

  await page.locator('.dash-rail a[href="/dashboard/vaults"]').click();
  await page.getByTestId("discard-leave").click();
  await expect(page).toHaveURL(/\/dashboard\/vaults/);
});

test("8. a direct load with #security lands on that card, and the nav says so", async ({ page }) => {
  await open(page, `${SETTINGS}#security`);

  /* the landing is re-measured across frames while the cards settle */
  await expect
    .poll(() => page.locator("#security").evaluate((el) => el.getBoundingClientRect().top), { timeout: 6000 })
    .toBeLessThan(120);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect
    .poll(() => page.getByTestId("settings-nav-security").getAttribute("aria-current"), { timeout: 4000 })
    .toBe("true");
});

test("9. motion = reduced writes data-motion and stops CSS animation, and it persists", async ({ page }) => {
  await open(page);

  await page.getByRole("radio", { name: "Reduced" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");

  const duration = await page
    .getByTestId("notif-payment_authorized-email")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(0.02);

  await page.getByTestId("pref-save").click();
  await expect(page.locator(".dash-toast-text", { hasText: "Preferences saved." })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(page.getByRole("radio", { name: "Reduced" })).toHaveAttribute("aria-checked", "true");
});

test("10. the 1440 measurements are the spec's", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);

  const box = (sel: string) =>
    page.locator(sel).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });

  expect(await box(".set-nav")).toEqual({ w: 233, h: 307 });
  expect((await box("#profile")).w).toBe(610);
  const summary = await box(".set-summary");
  expect(summary.w).toBe(377);
  expect(summary.h).toBeGreaterThanOrEqual(489);
  expect(summary.h).toBeLessThanOrEqual(492);
  expect((await box(".set-head")).h).toBe(144);
  expect((await box("#profile .set-input")).h).toBe(55);
  expect(await box("#notifications .set-switch")).toEqual({ w: 55, h: 34 });
  expect((await box(".set-summary-figure")).h).toBe(144);

  const gap = await page.locator(".set-grid").evaluate((el) => getComputedStyle(el).columnGap);
  expect(gap).toBe("21px");

  const cardPad = await page.locator("#profile").evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(cardPad).toBe("34px");
});

test("11. reduced motion: the final state, without the entrance", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);

  const anim = await page.locator("#profile").evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe("none");
  await expect(page.getByTestId("profile-name")).toHaveCSS("opacity", "1");
});

test("12. keyboard only: nav, a switch, a modal and back", async ({ page }) => {
  await open(page);

  await page.getByTestId("settings-nav-notifications").focus();
  await page.keyboard.press("Enter");

  const sw = page.getByTestId("notif-audit_completed-email");
  await sw.focus();
  await page.keyboard.press("Space");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("settings-live")).toHaveText("");

  /* the 2FA sheet traps focus, Escape closes it and returns the switch */
  await page.getByTestId("mfa-switch").click();
  await expect(page.getByTestId("mfa-modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("mfa-modal")).toBeHidden();
  await expect(page.getByTestId("mfa-switch")).toBeFocused();
});

test("13. no overflow-x and no load shift on the final state", async ({ page }) => {
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await open(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `${size.width}x${size.height}`).toBeLessThanOrEqual(0);
  }
});
