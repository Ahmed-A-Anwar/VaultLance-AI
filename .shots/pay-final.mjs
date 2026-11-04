import { chromium } from "@playwright/test";

const WIDTHS = [1920, 1440, 1280, 1024, 390];
const HEIGHTS = { 1920: 1080, 1440: 900, 1280: 720, 1024: 768, 390: 844 };
const FREE = { email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now() };
const CLIENT = { email: "client@vaultlance.ai", role: "client", since: Date.now() };
const base = "http://127.0.0.1:5173";

const b = await chromium.launch();

const open = async (w, who, url) => {
  const ctx = await b.newContext({ viewport: { width: w, height: HEIGHTS[w] } });
  const p = await ctx.newPage();
  await p.goto(base + "/signin", { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => {
    const js = JSON.stringify(s);
    localStorage.setItem("vl.dash.session", js);
    sessionStorage.setItem("vl.dash.session", js);
    sessionStorage.removeItem("vl.fd.store");
  }, who);
  await p.goto(base + url, { waitUntil: "domcontentloaded" });
  return { ctx, p };
};

/* a single viewport shot of the whole content: no stitching, so the glass
   layers paint once, and no entrance to restart on the resize */
const shot = async (p, w, name) => {
  await p.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
  const h = await p.evaluate(() =>
    Math.min(2800, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)),
  );
  await p.setViewportSize({ width: w, height: h });
  await p.waitForTimeout(250);
  await p.screenshot({ path: `.shots/pay/final-${name}-${w}.png` });
};

for (const w of WIDTHS) {
  {
    const { ctx, p } = await open(w, FREE, "/dashboard/payments");
    await p.waitForTimeout(2800);
    await shot(p, w, "free");
    const chip = p.locator(".pay-chipbtn", { hasText: "FAILED" });
    if (await chip.count()) {
      await chip.first().click();
      await p.waitForTimeout(500);
      await shot(p, w, "free-failed");
    }
    await ctx.close();
  }
  {
    const { ctx, p } = await open(w, FREE, "/dashboard/payments?slow=1");
    await p.waitForTimeout(700);
    await shot(p, w, "loading");
    await ctx.close();
  }
  {
    const { ctx, p } = await open(w, FREE, "/dashboard/payments?empty=1");
    await p.waitForTimeout(2800);
    await shot(p, w, "empty");
    await ctx.close();
  }
  {
    const { ctx, p } = await open(w, CLIENT, "/dashboard/payments");
    await p.waitForTimeout(2800);
    await shot(p, w, "client");
    await p.getByRole("tab", { name: /receipts/i }).click();
    await p.waitForTimeout(800);
    await shot(p, w, "client-receipts");
    await ctx.close();
  }
  {
    const { ctx, p } = await open(w, CLIENT, "/dashboard/payments?empty=1");
    await p.waitForTimeout(2800);
    await shot(p, w, "client-empty");
    await ctx.close();
  }
  {
    /* no email: the dev panel's switch, then the SPA route, so the mock's
       module state survives the move */
    const { ctx, p } = await open(w, FREE, "/dashboard");
    await p.waitForTimeout(2400);
    await p.keyboard.press("Shift+D");
    await p.waitForTimeout(400);
    const hide = p.getByRole("button", { name: "Hide PayPal email" });
    if (await hide.count()) await hide.click();
    await p.waitForTimeout(300);
    await p.evaluate(() => {
      const list = [...document.querySelectorAll('a[href="/dashboard/payments"]')];
      (list.find((x) => x.getBoundingClientRect().width > 0) ?? list[0])?.click();
    });
    await p.waitForTimeout(2600);
    await p.evaluate(() =>
      document.querySelectorAll(".fd-dev, .fd-hooks, .vl-toast, .dash-toast").forEach((el) => el.remove()),
    );
    await shot(p, w, "free-noemail");
    await ctx.close();
  }
  console.log("done", w);
}

await b.close();
