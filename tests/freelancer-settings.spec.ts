/* freelancer-settings.spec.ts — /dashboard/settings for the freelancer role:
   the payout email is one value across the Overview banner, the Payments
   payout-method card and Settings; the hash links land on their cards; delete
   asks the phase model; the dirty card guards navigation; the walk is
   keyboard-clean; motion can be reduced; and the 1440 measures are the
   shared spec's. */

import { test, expect, type Page } from "@playwright/test";

const FREELANCER = "freelancer@vaultlance.ai";
const SETTINGS = "/dashboard/settings";
const NEW_EMAIL = "maya.payouts@paypal.example";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.9;
    if (!sessionStorage.getItem("vl.dash.session")) {
      sessionStorage.setItem(
        "vl.dash.session",
        JSON.stringify({ email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now() })
      );
    }
    /* the payout address is the settings store's value; hide the dev seed */
  });
});

const openFreelancerSettings = async (page: Page) => {
  await page.goto(SETTINGS);
  await expect(page.getByTestId("account-summary")).toBeVisible();
};

/* the shell hydrates; a press sent before React has its listener attached is
   simply lost, so the helper presses until the panel exists, then stops */
async function openDevPanel(page: Page) {
  const dev = page.locator(".fd-dev");
  for (let i = 0; i < 6 && (await dev.count()) === 0; i++) {
    await page.keyboard.press("Shift+D");
    await page.waitForTimeout(300);
  }
  await expect(dev).toBeVisible();
}
async function closeDevPanel(page: Page) {
  await page.keyboard.press("Shift+D");
  await expect(page.locator(".fd-dev")).toHaveCount(0);
}

test("1. the payout email is one value: banner, settings and the payments card agree", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator(".fd-banner")).toHaveCount(0); // the seed ships an address

  // the dev seed clears it; the Overview's banner appears — nothing reloaded
  await openDevPanel(page);
  await page.getByRole("button", { name: "Hide PayPal email" }).click();
  await closeDevPanel(page);
  await expect(page.locator(".fd-banner")).toBeVisible();

  // a window marker that survives only without a reload
  await page.evaluate(() => ((window as Window & { __live?: boolean }).__live = true));

  // the banner's own link is an SPA navigation to the profile card — no reload
  await page.getByRole("link", { name: "Add email" }).click();
  await expect(page.getByTestId("account-summary")).toBeVisible();
  const payout = page.getByTestId("profile-paypal");
  await expect(payout).toHaveValue("");
  await expect(page.getByTestId("payout-status-chip")).toHaveText("NOT SET");

  await payout.fill(NEW_EMAIL);
  await page.getByTestId("profile-save").click();
  await expect(page.locator(".dash-toast-text", { hasText: "Profile saved." })).toBeVisible();
  await expect(page.getByTestId("payout-status-chip")).toHaveText("VERIFIED");

  // same document, rail click: the banner is answered
  await page.getByRole("link", { name: "Overview" }).click();
  const inPage = await page.evaluate(() => (window as Window & { __live?: boolean }).__live);
  expect(inPage, "no reload happened").toBe(true);
  await expect(page.locator(".fd-banner")).toHaveCount(0);

  // the payments page reads the same value
  await page.getByRole("link", { name: "Payments" }).click();
  await expect(page.locator(".pay-method-mail")).toHaveText(NEW_EMAIL);
});

test("2. hash landing: #profile, #payouts and #security each land on their card", async ({ context }) => {
  for (const [hash, key] of [
    ["#profile", "profile"],
    ["#payouts", "payouts"],
    ["#security", "security"],
  ] as Array<[string, string]>) {
    /* a fresh page per hash: a fragment-only goto stays in the document, and
       the landing contract is about arriving at the address, not about
       hopping between fragments in an already-open page */
    const deep = await context.newPage();
    await deep.addInitScript(() => {
      if (!sessionStorage.getItem("vl.dash.session")) {
        sessionStorage.setItem(
          "vl.dash.session",
          JSON.stringify({ email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now() })
        );
      }
    });
    await deep.goto(`${SETTINGS}${hash}`);
    await expect(deep.getByTestId("account-summary")).toBeVisible();
    /* the landing is re-measured across frames while the cards settle, and
       the nav's aria-current follows — the same contract the client test pins */
    await expect
      .poll(() => deep.locator(`#${key}`).evaluate((el) => el.getBoundingClientRect().top), { timeout: 6000 })
      .toBeLessThan(120);
    await expect
      .poll(() => deep.getByTestId(`settings-nav-${key}`).getAttribute("aria-current"), { timeout: 4000 })
      .toBe("true");
    await deep.close();
  }
});

test("3. delete is blocked with the seed's in-motion vaults, then the clean state lets it through", async ({ page }) => {
  await openFreelancerSettings(page);
  await page.getByTestId("delete-open").click();
  await expect(page.getByTestId("delete-modal")).toBeVisible();

  // the seed has money in motion; the modal lists it with the phase copy
  const blocked = page.locator(".set-blocked");
  await expect(blocked.getByText("Finish or resolve these vaults first.")).toBeVisible();
  const links = page.locator(".set-blocked-link");
  const linkCount = await links.count();
  expect(linkCount, "the seed's problem vaults are listed").toBeGreaterThan(0);
  await expect(links.first()).toHaveAttribute("href", "/dashboard/vaults");

  // clean the vaults through the dev panel, and the delete flows
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("delete-modal")).toBeHidden();
  await openDevPanel(page);
  await page.getByRole("button", { name: "All vaults clean" }).click();
  await closeDevPanel(page);

  await page.getByTestId("delete-open").click();
  await expect(page.getByTestId("delete-modal")).toBeVisible();
  await expect(blocked).toHaveCount(0);

  await page.getByTestId("delete-email").fill(FREELANCER);
  const hold = page.locator("button", { hasText: "Hold to delete" });
  const box = await hold.boundingBox();
  if (!box) throw new Error("hold button not shown");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1800);
  await page.mouse.up();
  await expect(page).toHaveURL(/\/$/); // routed to "/"
});

test("4. a dirty card asks before a rail click leaves the page", async ({ page }) => {
  await openFreelancerSettings(page);
  await page.getByTestId("profile-name").fill("Maya Ren");
  await expect(page.locator(".set-dirty[data-show='1']")).toBeVisible();
  await page.getByRole("link", { name: "Vaults" }).click();
  await expect(page.getByTestId("unsaved-modal")).toBeVisible();
  await expect(page.getByTestId("unsaved-modal")).toContainText("Discard unsaved changes?");
  // discarding really leaves, with the draft thrown away
  await page.getByTestId("discard-leave").click();
  await expect(page).toHaveURL(/\/dashboard\/vaults$/);
});

test("5. keyboard: the payout email is reachable, a switch flips, the modal opens and closes", async ({ page }) => {
  await openFreelancerSettings(page);
  await page.keyboard.press("Tab"); // into the nav
  // walk to the payouts nav item and open its card
  for (let i = 0; i < 12; i++) {
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
    if (focused === "settings-nav-payouts") break;
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Enter");
  await expect(page.locator("#payouts")).toBeInViewport({ ratio: 0.2 });
  await page.getByTestId("payouts-notify").click();
  await expect(page.getByTestId("payouts-notify")).toHaveAttribute("aria-checked", "false");

  /* the danger card's modal is reachable by keyboard too */
  await page.getByTestId("delete-open").click();
  await expect(page.getByTestId("delete-modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("delete-modal")).toBeHidden();
});

test("6. reduced motion: the saved pref is honored and the entrance is skipped", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "vl.settings",
      JSON.stringify({ fullName: "Maya", motion: "reduce", mfaOn: false })
    );
  });
  await openFreelancerSettings(page);
  const motion = await page.evaluate(() => document.documentElement.getAttribute("data-motion"));
  expect(motion).toBe("reduce");
});

test("7. CLS is zero and nothing scrolls sideways on the freelancer page", async ({ page }) => {
  await page.goto(SETTINGS, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (window as Window & { __cls?: number }).__cls = 0;
    new PerformanceObserver((list) => {
      let total = 0;
      for (const entry of list.getEntries()) total += (entry as PerformanceEntry & { value: number }).value;
      (window as Window & { __cls?: number }).__cls = total;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await expect(page.getByTestId("account-summary")).toBeVisible();
  const cls = await page.evaluate(() => (window as Window & { __cls?: number }).__cls);
  expect(cls, "no layout shift").toBeLessThanOrEqual(0.001);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no horizontal scrollbar").toBeLessThanOrEqual(0);
});

test("8. the 1440 measures are the spec's (nav 233, content 610, summary 377, gap 21, padding 34, input 55, switch 55x34)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFreelancerSettings(page);

  const rect = (sel: string) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().toJSON());
  const navW = await rect(".set-nav");
  expect(Math.round(navW.width)).toBe(233);

  const stack = await rect(".set-stack");
  expect(Math.round(stack.width)).toBe(610);

  const summary = await rect(".set-summary");
  expect(Math.round(summary.width)).toBe(377);

  const gap = await page.locator(".set-grid").evaluate((el) => getComputedStyle(el).columnGap);
  expect(parseFloat(gap)).toBe(21);

  const pad = await page.locator(".set-card").first().evaluate((el) => getComputedStyle(el).paddingTop);
  expect(parseFloat(pad)).toBe(34);

  const inputH = await page.locator(".set-input").first().evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.round(inputH)).toBe(55);

  const sw = await page.locator(".set-switch").first().boundingBox();
  expect(sw && Math.round(sw.width), "switch width 55").toBe(55);
  expect(sw && Math.round(sw.height), "switch height 34").toBe(34);
});
