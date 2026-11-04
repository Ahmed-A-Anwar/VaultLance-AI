import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const CLIENT = { email: "client@vaultlance.ai", role: "client", since: Date.now() };
const FREE = { email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now() };

const b = await chromium.launch();
const out = {};

const open = async (who, url, opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await p.goto(base + "/signin", { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => {
    const js = JSON.stringify(s);
    localStorage.setItem("vl.dash.session", js);
    sessionStorage.setItem("vl.dash.session", js);
    sessionStorage.removeItem("vl.fd.store");
  }, who);
  await p.goto(base + url, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  return { ctx, p };
};

/* ---------- CLS ---------- */
{
  const { ctx, p } = await open(FREE, "/dashboard/payments");
  out.cls = await p.evaluate(() => +window.__cls.toFixed(4));
  await ctx.close();
}

/* ---------- reduced motion ---------- */
{
  const { ctx, p } = await open(FREE, "/dashboard/payments", { reducedMotion: "reduce" });
  out.reduced = await p.evaluate(() => {
    const anims = document.getAnimations().map((a) => ({
      name: a.animationName ?? a.constructor.name,
      dur: a.effect?.getTiming().duration,
    }));
    const caption = document.querySelector(".pay-caption");
    return {
      running: anims.length,
      longOnes: anims.filter((a) => typeof a.dur === "number" && a.dur > 10).length,
      captionAnimation: caption ? getComputedStyle(caption).animationName : null,
      captionOpacity: caption ? getComputedStyle(caption).opacity : null,
    };
  });
  await p.screenshot({ path: ".shots/pay/reduced-motion.png" });
  await ctx.close();
}

/* ---------- entrance, normally ---------- */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(base + "/signin", { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => {
    const js = JSON.stringify(s);
    localStorage.setItem("vl.dash.session", js);
    sessionStorage.setItem("vl.dash.session", js);
    sessionStorage.removeItem("vl.fd.store");
  }, FREE);
  await p.goto(base + "/dashboard/payments", { waitUntil: "commit" });
  await p.waitForTimeout(120);
  out.entrance = await p.evaluate(() =>
    [...document.querySelectorAll(".pay-caption, .pay-kpi, .pay-card")].slice(0, 6).map((el) => {
      const cs = getComputedStyle(el);
      return {
        cls: el.className.toString().slice(0, 28),
        name: cs.animationName,
        dur: cs.animationDuration,
        delay: cs.animationDelay,
        tf: cs.transform === "none" ? "none" : "moving",
      };
    }),
  );
  await ctx.close();
}

/* ---------- keyboard: tabs ---------- */
{
  const { ctx, p } = await open(CLIENT, "/dashboard/payments");
  const tab = p.getByRole("tab", { name: /holds/i });
  await tab.focus();
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(500);
  out.tabs = {
    role: await p.getByRole("tablist").count(),
    selectedAfterArrow: await p.evaluate(
      () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ),
    panelLabelled: await p.evaluate(() => {
      const panel = document.querySelector('[role="tabpanel"]');
      return panel ? { label: panel.getAttribute("aria-labelledby") } : null;
    }),
    focused: await p.evaluate(() => document.activeElement?.textContent),
  };

  /* aria labels on the page's buttons and grids */
  out.labels = await p.evaluate(() => {
    const q = (sel) => [...document.querySelectorAll(sel)].map((el) => ({
      label: el.getAttribute("aria-label"),
      text: (el.textContent ?? "").trim().slice(0, 30),
    }));
    return {
      grids: [...document.querySelectorAll(".ag-root")].map((g) =>
        g.getAttribute("aria-label") ?? g.closest("[aria-label]")?.getAttribute("aria-label"),
      ),
      buttons: q(".pay-dl, .fd-copy, .pay-hold button"),
    };
  });
  await ctx.close();
}

/* ---------- keyboard on the payouts grid ---------- */
{
  const { ctx, p } = await open(FREE, "/dashboard/payments");
  await p.locator(".pay-grid .ag-row").first().locator(".ag-cell").first().click();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(400);
  out.gridEnter = {
    popover: (await p.locator(".pay-pop").count()) > 0,
    label: await p.locator(".pay-pop").getAttribute("aria-label").catch(() => null),
  };
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  out.gridEnter.closedByEscape = (await p.locator(".pay-pop").count()) === 0;
  /* tab order reaches the retry button */
  out.retryReachable = await p.locator(".pay-retry").first().isVisible();
  await ctx.close();
}

/* ---------- routing: neither role gets the overview ---------- */
{
  for (const [name, who] of [
    ["freelancer", FREE],
    ["client", CLIENT],
  ]) {
    const { ctx, p } = await open(who, "/dashboard/payments");
    const body = await p.locator("body").innerText();
    out[`route-${name}`] = {
      caption: (await p.locator(".pay-caption").innerText().catch(() => null))?.trim(),
      hasOverviewWords: /PAID OUT|IN ESCROW/.test(body),
      title: (await p.locator(".dash-strip h1, .dash-title, .dash-strip").first().innerText().catch(() => "")).trim().slice(0, 20),
      railActive: await p.evaluate(() => {
        const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("aria-current") === "page");
        return a ? a.textContent.trim() : null;
      }),
    };
    await ctx.close();
  }
}

console.log(JSON.stringify(out, null, 1));
await b.close();
