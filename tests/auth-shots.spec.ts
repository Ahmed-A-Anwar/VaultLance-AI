/* auth-shots.spec.ts — the reset screens at five widths, plus the numbers the
   spec asks to be measured. Writes PNGs into docs/auth/. */

import { test, expect, type Page } from "@playwright/test";

const STRONG = "Aa1!aaaaaaaa";
const WEAK = "aaaaaaaa";
const SIZES = [
  { w: 1920, h: 1080 },
  { w: 1440, h: 900 },
  { w: 1280, h: 720 },
  { w: 1024, h: 768 },
  { w: 390, h: 844 },
];

type Metrics = { cls: number; overflow: number };

async function settle(page: Page) {
  /* fonts and the vault frame both paint late; two frames is enough to settle */
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(350);
}

async function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => ({
    cls: Number(window.__cls ?? 0),
    overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
  }));
}

async function shot(page: Page, name: string, w: number, h: number) {
  await settle(page);
  await page.screenshot({ path: `docs/auth/${name}-${w}x${h}.png` });
}

const sent = async (page: Page) => {
  await page.getByTestId("forgot-sent").waitFor();
  await page.getByTestId("forgot-sent").waitFor({ state: "visible" });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.9;
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
  });
});

for (const { w, h } of SIZES) {
  test(`reset screens at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: w, height: h });
    const seen: Metrics[] = [];

    /* request form, and the same form with its empty-field error */
    await page.goto("/forgot-password");
    await shot(page, "request", w, h);
    await page.getByTestId("forgot-submit").click();
    await page.getByTestId("forgot-email-err").waitFor();
    await shot(page, "request-error", w, h);
    seen.push(await metrics(page));

    /* the sent state */
    await page.locator("#forgot-email").fill("a@b.co");
    await page.getByTestId("forgot-submit").click();
    await sent(page);
    await shot(page, "sent", w, h);
    seen.push(await metrics(page));

    /* resend ready: the cooldown run out */
    await page.clock.install();
    await page.clock.runFor(1000);
    await page.getByTestId("sent-resend").waitFor({ state: "visible" });
    await page.clock.runFor(56_000);
    await shot(page, "sent-resend-ready", w, h);
    await page.clock.resume();

    /* the reset form, weak and strong */
    await page.goto("/reset-password?token=demo-valid");
    await page.locator("#reset-password").fill(WEAK);
    await page.locator("#reset-confirm").fill(WEAK);
    await shot(page, "reset-weak", w, h);
    seen.push(await metrics(page));

    await page.locator("#reset-password").fill(STRONG);
    await page.locator("#reset-confirm").fill(STRONG);
    await shot(page, "reset-strong", w, h);

    /* the mismatch, on blur */
    await page.locator("#reset-confirm").fill("Aa1!aaaaaaab");
    await page.locator("#reset-confirm").blur();
    await page.getByTestId("reset-confirm-err").waitFor();
    await shot(page, "reset-mismatch", w, h);

    /* success */
    await page.locator("#reset-confirm").fill(STRONG);
    await page.getByTestId("reset-submit").click();
    await page.getByTestId("reset-success").waitFor();
    await shot(page, "success", w, h);
    seen.push(await metrics(page));

    /* the two dead ends */
    await page.goto("/reset-password?token=demo-expired");
    await shot(page, "expired", w, h);
    await page.goto("/reset-password?token=foo");
    await shot(page, "invalid", w, h);
    seen.push(await metrics(page));

    /* no state scrolls sideways, and nothing moves by more than the card's own
       re-centring (it hugs its content and is centred on the 50% line, so a
       state that is taller or shorter than the last one moves the card's top) */
    for (const m of seen) {
      expect(m.overflow).toBe(0);
      expect(m.cls).toBeLessThan(0.06);
    }
    console.log(`CLS ${w}x${h}`, JSON.stringify(seen.map((s) => +s.cls.toFixed(4))));
  });
}

test("the spec's measurements at 1440x900", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/forgot-password");
  await settle(page);

  const m = await page.evaluate(() => {
    const card = document.querySelector(".auth-card") as HTMLElement;
    const input = document.querySelector("#forgot-email") as HTMLElement;
    const button = document.querySelector('[data-testid="forgot-submit"]') as HTMLElement;
    const rect = document.querySelector(".hero-rect") as HTMLElement;
    const cr = card.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const br = button.getBoundingClientRect();
    const rr = rect.getBoundingClientRect();
    const shift = document.querySelector(".vault-shift") as HTMLElement;
    return {
      cardWidth: Math.round(cr.width),
      cardCenterPct: +(((cr.left + cr.width / 2) / window.innerWidth) * 100).toFixed(2),
      inputHeight: Math.round(ir.height),
      buttonHeight: Math.round(br.height),
      /* the wheel sits at 53.54% / 49.72% of the drawn frame */
      wheelX: +(((rr.left + rr.width * 0.5354) / window.innerWidth) * 100).toFixed(2),
      wheelY: +(((rr.top + rr.height * 0.4972) / window.innerHeight) * 100).toFixed(2),
      vaultX: getComputedStyle(shift).getPropertyValue("--vault-x").trim(),
    };
  });

  console.log("MEASUREMENTS", JSON.stringify(m, null, 2));

  expect(m.cardWidth).toBe(453);
  expect(Math.abs(m.cardCenterPct - 38.2)).toBeLessThan(0.5);
  expect(m.inputHeight).toBe(55);
  expect(m.buttonHeight).toBe(55);
  expect(m.wheelX).toBeCloseTo(76.4, 1);
  expect(m.wheelY).toBeCloseTo(50, 0);

  /* the reset screen shares the card and the column */
  await page.goto("/reset-password?token=demo-valid");
  await settle(page);
  const resetCard = await page.evaluate(() => {
    const card = document.querySelector(".auth-card") as HTMLElement;
    const cr = card.getBoundingClientRect();
    return {
      width: Math.round(cr.width),
      center: +(((cr.left + cr.width / 2) / window.innerWidth) * 100).toFixed(2),
      input: Math.round((document.querySelector("#reset-password") as HTMLElement).getBoundingClientRect().height),
      button: Math.round((document.querySelector('[data-testid="reset-submit"]') as HTMLElement).getBoundingClientRect().height),
    };
  });
  expect(resetCard.width).toBe(453);
  expect(Math.abs(resetCard.center - 38.2)).toBeLessThan(0.5);
  expect(resetCard.input).toBe(55);
  expect(resetCard.button).toBe(55);
});

test("CLS on load is zero on every reset route", async ({ page }) => {
  for (const size of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    await page.setViewportSize({ width: size.w, height: size.h });
    for (const path of ["/forgot-password", "/reset-password?token=demo-valid", "/reset-password?token=demo-expired"]) {
      await page.goto(path);
      await page.waitForTimeout(1200);
      const { cls, overflow } = await metrics(page);
      expect(overflow).toBe(0);
      expect(cls).toBe(0);
    }
  }
});

declare global {
  interface Window {
    __cls?: number;
  }
}
