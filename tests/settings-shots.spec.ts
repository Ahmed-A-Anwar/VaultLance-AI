/* settings-shots.spec.ts — the nine states at the five widths, plus the 1440
   measurements printed for the report. Artifacts land in docs/settings/. */

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SIZES: Array<[number, number]> = [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [390, 844],
];

const EMAIL = "client@northfield.co";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.9;
    if (!sessionStorage.getItem("vl.dash.session")) {
      sessionStorage.setItem(
        "vl.dash.session",
        JSON.stringify({ email: "client@northfield.co", role: "client", since: Date.now() })
      );
    }
  });
});

const fresh = async (page: Page, path = "/dashboard/settings") => {
  await page.evaluate(() => sessionStorage.removeItem("vl.settings")).catch(() => {});
  await page.goto(path);
  await page.waitForSelector('[data-testid="account-summary"]');
  await page.waitForTimeout(1100);
};

const centre = async (page: Page, selector: string) => {
  await page.locator(selector).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -21));
  await page.waitForTimeout(250);
};

test("the nine settings states at five widths", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync("docs/settings", { recursive: true });

  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    const shot = (name: string) =>
      page.screenshot({ path: `docs/settings/${name}-${w}x${h}.png` });

    /* 1. loading */
    await page.evaluate(() => sessionStorage.removeItem("vl.settings")).catch(() => {});
    await page.goto("/dashboard/settings?slow=1");
    await page.waitForSelector(".set-card.is-skeleton");
    await page.waitForTimeout(700);
    await shot("01-loading");

    /* 2. populated */
    await fresh(page);
    await shot("02-populated");

    /* 3. a dirty profile */
    await page.getByTestId("profile-name").fill("Amira Hassan");
    await page.waitForTimeout(500);
    await shot("03-dirty-profile");

    /* 4. every notification muted */
    await fresh(page);
    await centre(page, "#notifications");
    await page.getByTestId("notif-mute").click();
    await page.waitForTimeout(900);
    await shot("04-notifications-muted");

    /* 5. a rejected current password */
    await fresh(page);
    await centre(page, "#security");
    await page.locator("#pw-current").fill("wrong");
    await page.locator("#pw-new").fill("Aa1!aaaaaaaa");
    await page.locator("#pw-confirm").fill("Aa1!aaaaaaaa");
    await page.getByTestId("pw-update").click();
    await page.waitForTimeout(900);
    await shot("05-password-error");

    /* 6. the two-factor sheet */
    await fresh(page);
    await centre(page, "#security");
    await page.getByTestId("mfa-switch").click();
    await page.waitForSelector('[data-testid="mfa-modal"]');
    await page.waitForTimeout(500);
    await shot("06-two-factor");

    /* 7. a session armed for its second click */
    await fresh(page);
    await centre(page, "#security .set-sessions");
    await page.getByTestId("revoke-s_iphone").click();
    await page.waitForTimeout(400);
    await shot("07-session-confirm");

    /* 8. delete, blocked by a held vault */
    await fresh(page);
    await centre(page, "#danger");
    await page.getByTestId("delete-open").click();
    await page.waitForSelector('[data-testid="delete-modal"]');
    await page.waitForTimeout(700);
    await shot("08-delete-blocked");
    await page.getByRole("button", { name: "Close" }).click();

    /* 9. delete, with the email typed */
    await fresh(page, "/dashboard/settings?empty=1");
    await centre(page, "#danger");
    await page.getByTestId("delete-open").click();
    await page.waitForSelector('[data-testid="delete-modal"]');
    await page.getByTestId("delete-email").fill(EMAIL);
    await page.waitForTimeout(500);
    await shot("09-delete-modal");
  }
});

test("the load's layout shift, printed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto("/dashboard/settings");
  await page.waitForSelector('[data-testid="account-summary"]');
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  console.log(JSON.stringify({ cls: Number(cls.toFixed(4)) }));
});

test("the 1440 measurements, printed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page);

  const box = (sel: string) =>
    page.locator(sel).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });

  const grid = await box(".set-grid");
  const nav = await box(".set-nav");
  const cards = await box("#profile");
  const summary = await box(".set-summary");
  const head = await box(".set-head");
  const input = await box("#profile .set-input");
  const sw = await box("#notifications .set-switch");
  const figure = await box(".set-summary-figure");
  const pad = await page.locator("#profile").evaluate((el) => getComputedStyle(el).paddingLeft);
  const gap = await page.locator(".set-grid").evaluate((el) => getComputedStyle(el).columnGap);

  /* the card's centre inside the content area, as a share of the viewport */
  const contentLeft = 89;
  const contentW = 1440 - 17 - 89 - 68;
  const centrePct = ((cards.x + cards.w / 2 - contentLeft) / contentW) * 100;

  console.log(
    JSON.stringify(
      {
        grid,
        nav,
        cards,
        summary,
        head,
        input,
        switch: sw,
        figure,
        padding: pad,
        gap,
        cardCentreOfContent: `${centrePct.toFixed(2)}%`,
        scroll: await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        })),
      },
      null,
      2
    )
  );

  expect(cards.w).toBe(610);
  expect(nav.w).toBe(233);
  expect(summary.w).toBe(377);
  expect(head.h).toBe(144);
  expect(input.h).toBe(55);
  expect(sw.h).toBe(34);
  expect(figure.h).toBe(144);
  expect(pad).toBe("34px");
  expect(gap).toBe("21px");
});
