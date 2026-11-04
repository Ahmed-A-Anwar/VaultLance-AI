import { chromium } from "@playwright/test";

/* fsettings-final.mjs — the deliverable shots for the freelancer settings:
   every card (hash landing for one), the blocked-delete modal, the shell's
   404 and, behind FX.paymentsPage=false, the not-available page.
   usage: node .shots/fsettings-final.mjs <cards|modal|notfound|notavailable> */

const base = "http://127.0.0.1:5173";
const what = process.argv[2] ?? "cards";
const who = { email: "freelancer@vaultlance.ai", role: "freelancer", since: 1_700_000_000_000 };
const sizes = [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [390, 844],
];

const b = await chromium.launch();
for (const [w, h] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(`${base}/signin`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => {
    const js = JSON.stringify(s);
    localStorage.setItem("vl.dash.session", js);
    sessionStorage.setItem("vl.dash.session", js);
  }, who);

  if (what === "cards") {
    for (const key of ["profile", "payouts", "notifications", "security", "preferences", "danger"]) {
      await p.goto(`${base}/dashboard/settings#${key}`, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(2600);
      await p.addStyleTag({
        content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
      });
      await p.waitForTimeout(120);
      await p.screenshot({ path: `.shots/fsettings/card-${key}-${w}.png` });
    }
  }

  if (what === "modal") {
    await p.goto(`${base}/dashboard/settings#danger`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2600);
    await p.getByTestId("delete-open").click();
    await p.waitForTimeout(900);
    await p.screenshot({ path: `.shots/fsettings/blocked-modal-${w}.png` });
  }

  if (what === "notfound") {
    await p.goto(`${base}/dashboard/definitely-not-a-route`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2200);
    await p.screenshot({ path: `.shots/fsettings/notfound-${w}.png` });
  }

  if (what === "notavailable") {
    await p.goto(`${base}/dashboard/payments`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2200);
    await p.screenshot({ path: `.shots/fsettings/notavailable-${w}.png` });
  }

  await ctx.close();
}
await b.close();
console.log("captured", what);
