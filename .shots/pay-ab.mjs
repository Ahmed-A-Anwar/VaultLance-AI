import { chromium } from "@playwright/test";

const label = process.argv[2] ?? "head";
const base = "http://127.0.0.1:5173";
const roles = [
  ["freelancer", { email: "freelancer@vaultlance.ai", role: "freelancer", since: 1_700_000_000_000 }],
  ["client", { email: "client@vaultlance.ai", role: "client", since: 1_700_000_000_000 }],
];
const sizes = [
  [1440, 900],
  [390, 844],
];

const b = await chromium.launch();
for (const [role, who] of roles) {
  for (const [w, h] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto(base + "/signin", { waitUntil: "domcontentloaded" });
    await p.evaluate((s) => {
      const js = JSON.stringify(s);
      localStorage.setItem("vl.dash.session", js);
      sessionStorage.setItem("vl.dash.session", js);
    }, who);
    await p.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(3200);
    await p.addStyleTag({
      content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
    });
    await p.waitForTimeout(120);
    await p.screenshot({ path: `.shots/pay/ab-${label}-${role}-${w}.png` });
    await ctx.close();
  }
}
await b.close();
console.log("captured", label);
