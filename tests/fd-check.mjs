/* fd-check.mjs — the freelancer dashboard's smoke run. The mock fails 5% of
   reads on purpose, so every navigation retries once before it is called a
   failure; a retry that succeeds is the contract, not a workaround. */

import { chromium } from "@playwright/test";
import fs from "node:fs";

const base = "http://127.0.0.1:5173";
const out = [];
const fail = (m) => {
  out.push(`FAIL ${m}`);
  process.exitCode = 1;
};
const ok = (m) => out.push(`ok   ${m}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) {
    errors.push(m.text());
  }
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.addInitScript(() => {
  const s = { email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now(), name: "Maya" };
  window.localStorage.setItem("vl.dash.session", JSON.stringify(s));
  window.sessionStorage.setItem("vl.dash.session", JSON.stringify(s));
});

/** navigate, then wait for cards; one retry covers a simulated read failure */
const cards = async (path) => {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector(".fd-card", { timeout: 12000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".fd-card", { timeout: 15000 });
  }
};

await cards("/dashboard");

const count = await page.locator(".fd-card").count();
const kpis = await page.locator(".fd-kpi").count();
const h1 = (await page.locator(".fd-h1").first().textContent())?.trim();
const sub = (await page.locator(".fd-sub").textContent())?.trim();
const chips = await page.locator(".fd-card .fd-chip").allTextContents();
const steps = await page.locator(".fd-card").first().locator(".fd-step").count();

count === 6 ? ok("six vault cards") : fail(`expected 6 cards, saw ${count}`);
kpis === 3 ? ok("three KPI cards") : fail(`expected 3 KPIs, saw ${kpis}`);
steps === 5 ? ok("five bolts per card") : fail(`expected 5 steps, saw ${steps}`);
(h1 ?? "").startsWith("Good") ? ok(`greeting "${h1}"`) : fail(`greeting missing: ${h1}`);
ok(`status line "${sub}"`);
ok(`chips: ${chips.join(", ")}`);

/* details drawer */
await page.locator(".fd-info").first().click();
await page.waitForSelector(".fd-detail", { timeout: 5000 });
const detailTitle = (await page.locator(".fd-detail .fd-h2").textContent())?.trim();
const feeRows = await page.locator(".fd-detail .fd-fee p").count();
feeRows === 4 ? ok(`details drawer for "${detailTitle}" with 4 money rows`) : fail(`fee rows ${feeRows}`);
await page.keyboard.press("Escape");
await page.waitForSelector(".fd-detail", { state: "detached", timeout: 5000 });
ok("Escape closed details");

/* new vault drawer: step 1 gates on the form */
await page.getByRole("button", { name: "New vault" }).first().click();
await page.waitForSelector(".fd-drawer", { timeout: 5000 });
const next = page.getByRole("button", { name: "Next", exact: true });
const disabledEmpty = await next.isDisabled();
disabledEmpty ? ok("Next disabled on an empty form") : fail("Next enabled with no details");

await page.getByLabel("PROJECT NAME").fill("Motion Pack");
await page.getByLabel("CLIENT EMAIL").fill("client@example.com");
await page.getByLabel("AMOUNT (USD)").fill("180");
const enabledNow = await next.isEnabled();
enabledNow ? ok("Next enabled once the details are valid") : fail("Next still disabled");
await next.click();
await page.waitForTimeout(300);
const onDeliverables = await page.getByText("Drop a .zip here or browse").isVisible();
onDeliverables ? ok("details step advances to deliverables") : fail("did not reach deliverables");

fs.mkdirSync(".shots", { recursive: true });
await page.screenshot({ path: ".shots/fd-drawer.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

/* the other two routes */
await page.goto(base + "/dashboard/ledger", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".ag-row", { timeout: 15000 }).catch(() => {});
const gridRows = await page.locator(".ag-row").count();
gridRows > 0 ? ok(`earnings ledger rendered ${gridRows} rows`) : fail("ledger has no rows");
await page.screenshot({ path: ".shots/fd-ledger.png", fullPage: true });

await cards("/dashboard/vaults");
const vaultCards = await page.locator(".fd-card").count();
vaultCards === 6 ? ok("vaults route shows all six") : fail(`vaults route showed ${vaultCards}`);

/* overview at 1440 and a 390 sanity pass */
await cards("/dashboard");
await page.screenshot({ path: ".shots/fd-overview-1440.png", fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
!overflow ? ok("no horizontal overflow at 390px") : fail("page overflows at 390px");
await page.screenshot({ path: ".shots/fd-overview-390.png", fullPage: true });

errors.length === 0 ? ok("no console errors") : fail(`console errors: ${errors.slice(0, 3).join(" | ")}`);

await browser.close();
console.log(out.join("\n"));
