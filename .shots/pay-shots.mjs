import { chromium } from "@playwright/test";

const WIDTHS = [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [390, 844],
];

const FREELANCER = { email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now() };
const CLIENT = { email: "client@vaultlance.ai", role: "client", since: Date.now() };

const base = "http://127.0.0.1:5173";
const b = await chromium.launch();
const report = [];

const session = async (ctx, who) => {
  const p = await ctx.newPage();
  await p.goto(base + "/signin", { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => {
    const js = JSON.stringify(s);
    localStorage.setItem("vl.dash.session", js);
    sessionStorage.setItem("vl.dash.session", js);
    sessionStorage.removeItem("vl.fd.store");
  }, who);
  return p;
};

const settle = async (p, ms = 2800) => p.waitForTimeout(ms);

/* fullPage capture resizes the viewport, which restarts the entrance
   animations and paints a glass surface over the shot; by now they have
   finished, so removing them changes nothing but the capture */
const snap = async (p, path) => {
  await p.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
  await p.waitForTimeout(80);
  await p.screenshot({ path, fullPage: true });
};

const metrics = (p) =>
  p.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect() : null;
    };
    const kpi = r(".pay-kpi");
    const cols = document.querySelector(".pay-cols");
    const left = cols?.children[0]?.getBoundingClientRect();
    const right = cols?.children[1]?.getBoundingClientRect();
    const grid = document.querySelector(".pay-grid");
    const row = document.querySelector(".pay-grid .ag-row") ?? document.querySelector(".pay-hold");
    return {
      cardH: kpi ? Math.round(kpi.height) : null,
      ratio: left && right && right.width ? +(left.width / right.width).toFixed(3) : null,
      rowH: row ? Math.round(row.getBoundingClientRect().height) : null,
      gapCards: cols ? getComputedStyle(cols).columnGap : null,
      sidebar: getComputedStyle(document.querySelector(".pay-page") ?? document.body).gap || null,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      gridOverflow: grid ? grid.scrollWidth - grid.clientWidth : null,
      hScrollRegions: [...document.querySelectorAll(".pay-page *")]
        .filter((el) => el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).overflowX !== "visible")
        .map((el) => el.className.toString().slice(0, 40))
        .slice(0, 5),
    };
  });

for (const [w, h] of WIDTHS) {
  const tag = `${w}x${h}`;

  /* ---- freelancer, populated ---- */
  {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await session(ctx, FREELANCER);
    await p.goto(base + "/dashboard/payments", { waitUntil: "domcontentloaded" });
    await settle(p);
    report.push({ shot: `free-${tag}`, ...(await metrics(p)) });
    await snap(p, `.shots/pay/free-${tag}.png`);

    /* failed row, filtered */
    const chip = p.locator(".pay-chipbtn", { hasText: "FAILED" });
    if (await chip.count()) {
      await chip.first().click();
      await p.waitForTimeout(500);
      await snap(p, `.shots/pay/free-failed-${tag}.png`);
      await chip.first().click();
      await p.waitForTimeout(400);
    }

    /* no email */
    await p.keyboard.press("Shift+D");
    await p.waitForTimeout(300);
    const hide = p.getByRole("button", { name: "Hide PayPal email" });
    if (await hide.count()) {
      await hide.first().click();
      /* the rail's Payments item is the one the layout renders; a plain
         element.click() keeps the SPA route and the mock's module state */
      await p.evaluate(() => {
        const link = [...document.querySelectorAll('a[href="/dashboard/payments"]')].find(
          (a) => a.getBoundingClientRect().width > 0,
        ) ?? document.querySelector('a[href="/dashboard/payments"]');
        link?.click();
      });
      await p.waitForTimeout(2200);
      await snap(p, `.shots/pay/free-noemail-${tag}.png`);
      report.push({
        shot: `free-noemail-${tag}`,
        state: (await p.locator(".pay-method").innerText()).replace(/\s+/g, " ").trim(),
      });
    }
    await p.close();
    await ctx.close();
  }

  /* ---- client holds + receipts ---- */
  {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await session(ctx, CLIENT);
    await p.goto(base + "/dashboard/payments", { waitUntil: "domcontentloaded" });
    await settle(p);
    report.push({ shot: `client-${tag}`, ...(await metrics(p)) });
    await snap(p, `.shots/pay/client-${tag}.png`);
    const tab = p.getByRole("tab", { name: /receipts/i });
    if (await tab.count()) {
      await tab.click();
      await p.waitForTimeout(800);
      report.push({ shot: `client-receipts-${tag}`, ...(await metrics(p)) });
      await snap(p, `.shots/pay/client-receipts-${tag}.png`);
    }
    await p.goto(base + "/dashboard/payments?empty=1", { waitUntil: "domcontentloaded" });
    await settle(p);
    await snap(p, `.shots/pay/client-empty-${tag}.png`);
    report.push({
      shot: `client-empty-${tag}`,
      text: (await p.locator("[role=tabpanel]").first().innerText()).replace(/\s+/g, " ").slice(0, 60),
    });
    await p.close();
    await ctx.close();
  }

  /* ---- empty ---- */
  {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await session(ctx, FREELANCER);
    await p.goto(base + "/dashboard/payments?empty=1", { waitUntil: "domcontentloaded" });
    await settle(p);
    await snap(p, `.shots/pay/empty-${tag}.png`);
    report.push({
      shot: `empty-${tag}`,
      text: (await p.locator(".pay-cols").innerText()).replace(/\s+/g, " ").slice(0, 120),
    });
    await p.close();
    await ctx.close();
  }

  /* ---- loading ---- */
  {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await session(ctx, FREELANCER);
    await p.goto(base + "/dashboard/payments?slow=1", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(700);
    await p.screenshot({ path: `.shots/pay/loading-${tag}.png`, fullPage: true });
    report.push({ shot: `loading-${tag}`, skeletons: await p.locator(".fd-sk, .pay-sk, [class*=skel]").count() });
    await p.close();
    await ctx.close();
  }
}

console.log(JSON.stringify(report, null, 1));
await b.close();
