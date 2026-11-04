import { chromium } from "@playwright/test";

/* ab-fsettings.mjs — the client pages' A/B capture for the freelancer routing
   slice. usage: node .shots/ab-fsettings.mjs <port> <label>. The client's
   Overview and Settings must be pixel-identical across the route-table change;
   the comparison itself runs through scripts/pixel-compare.mjs. */

const port = process.argv[2] ?? "5173";
const label = process.argv[3] ?? "after";
const base = `http://127.0.0.1:${port}`;
/* the client's own seeded session, the same shape the dashboard writes */
const who = { email: "client@northfield.co", role: "client", since: 1_700_000_000_000 };
const pages = ["/dashboard", "/dashboard/settings"];
const sizes = [
  [1440, 900],
  [390, 844],
];

const b = await chromium.launch();
for (const route of pages) {
  for (const [w, h] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto(`${base}/signin`, { waitUntil: "domcontentloaded" });
    await p.evaluate((s) => {
      const js = JSON.stringify(s);
      localStorage.setItem("vl.dash.session", js);
      sessionStorage.setItem("vl.dash.session", js);
    }, who);
    await p.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(3200);
    await p.addStyleTag({
      content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
    });
    await p.waitForTimeout(120);
    const name = route === "/dashboard" ? "dash" : "settings";
    await p.screenshot({ path: `.shots/fsettings/ab-${name}-${label}-${w}.png` });
    await ctx.close();
  }
}
await b.close();
console.log("captured", label);
