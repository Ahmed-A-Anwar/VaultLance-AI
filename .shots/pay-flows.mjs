import { chromium } from "@playwright/test";

const fees = (cents) => {
  const vl = Math.round(cents * 0.05);
  const pp = Math.round(cents * 0.054 + 30);
  return { vl, pp, net: cents - vl - pp };
};

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));

await p.goto("http://127.0.0.1:5173/signin", { waitUntil: "domcontentloaded" });
await p.evaluate(
  (s) => {
    const js = JSON.stringify(s);
    localStorage.setItem("vl.dash.session", js);
    sessionStorage.setItem("vl.dash.session", js);
    sessionStorage.removeItem("vl.fd.store");
  },
  { email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now() },
);
await p.goto("http://127.0.0.1:5173/dashboard/payments", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2600);

const kpi = async () =>
  (await p.locator(".pay-kpis").innerText()).replace(/\s+/g, " ").trim();
const rows = async () =>
  (await p.locator(".pay-grid .ag-row").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());

const out = {};

/* ---- 1. the popover ---- */
await p.locator(".pay-grid .ag-row").first().click();
await p.waitForTimeout(300);
out.popover = (await p.locator(".pay-pop").innerText()).replace(/\s+/g, " ").trim();
await p.keyboard.press("Escape");
await p.waitForTimeout(250);
out.popoverClosed = (await p.locator(".pay-pop").count()) === 0;

/* ---- 2. copy the PayPal ID ---- */
const copyBtn = p.locator(".pay-grid .ag-row").nth(1).locator(".fd-copy");
await copyBtn.click();
await p.waitForTimeout(400);
out.copied = await p.evaluate(() => navigator.clipboard.readText());
out.copyToast = await p.locator(".vl-toast, [role=status]").first().innerText().catch(() => "");

/* ---- 3. the fee calculator ---- */
const calc = async (v) => {
  await p.locator(".pay-input").fill(String(v));
  await p.waitForTimeout(700);
  const rows = await p.locator(".pay-calc-rows > div").allInnerTexts();
  return rows.map((r) => r.replace(/\s+/g, " ").trim());
};
out.calc = {};
for (const v of [10, 180, 2400]) {
  out.calc[v] = { shown: await calc(v), expected: fees(v * 100) };
}
await p.locator(".pay-input").fill("4");
await p.waitForTimeout(400);
out.calcInvalid = (await p.locator(".pay-calc-err").innerText()).trim();
await p.locator(".pay-input").fill("nope");
await p.waitForTimeout(300);
out.calcNotANumber = (await p.locator(".pay-calc-err").innerText()).trim();
await p.locator(".pay-input").fill("180");

/* ---- 4. retry the failed payout ---- */
out.before = { kpi: await kpi(), rows: await rows() };
const retry = p.locator(".pay-grid .ag-row").first().locator("button", { hasText: "Retry" });
await retry.click();
await p.waitForTimeout(2400);
out.after = { kpi: await kpi(), rows: await rows() };
out.nan = /NaN/.test(await p.locator("body").innerText());

/* ---- 5. the receipt ---- */
const [popup] = await Promise.all([
  ctx.waitForEvent("page", { timeout: 4000 }).catch(() => null),
  p.locator(".pay-grid .ag-row").first().click().then(async () => {
    await p.waitForTimeout(350);
    await p.locator(".pay-pop button", { hasText: "Download receipt" }).click();
  }),
]);
out.receipt = popup ? (await popup.content()).slice(0, 0) || "opened" : "no popup";
if (popup) {
  await popup.waitForTimeout(500);
  const body = await popup.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
  out.receipt = body.slice(0, 140);
  await popup.close();
}
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await b.close();
