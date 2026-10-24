/* signup-frames.mjs — record the hero -> /signup transition with a CDP
   screencast and keep the frames closest to t = 0, 0.6, 1.2, 2.0, 2.9s after
   the route actually changes. Wall-clock screenshots drift by their own latency;
   this picks real rendered frames against a page-side timestamp. */

import { chromium } from "playwright";
import fs from "node:fs";

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = process.env.OUT ?? "docs/hero-shots/signup";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
const MODE = process.env.MODE ?? "forward";
const GOAL = MODE === "back" ? "/" : "/signup";
const TARGETS = MODE === "back" ? [0, 200, 500, 900, 1600] : [0, 600, 1200, 2000, 2900];
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const cdp = await page.context().newCDPSession(page);

await cdp.send("Page.enable");
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(3600);

if (MODE === "back") {
  await page.click('[data-testid="hero-signup"]');
  await page.waitForFunction(() => location.pathname === "/signup");
  await page.waitForTimeout(2600);
}

const frames = [];
const navAt = new Promise((resolve) => {
  cdp.on("Runtime.consoleAPICalled", (e) => {
    if (e.args?.[0]?.value === "NAV") resolve(e.timestamp);
  });
});
cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
  frames.push({ t: metadata.timestamp, data });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});

await cdp.send("Runtime.enable");
await page.evaluate((goal) => {
  const tick = () => {
    if (location.pathname === goal && !window.__said) {
      window.__said = true;
      console.log("NAV");
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, GOAL);
await cdp.send("Page.startScreencast", { format: "png", maxWidth: W, maxHeight: H, everyNthFrame: 1 });

if (MODE === "back") await page.goBack();
else await page.click('[data-testid="hero-signup"]');
const navTime = await navAt;
await page.waitForTimeout(3400);
await cdp.send("Page.stopScreencast");

/* screencast timestamps are seconds, console timestamps are milliseconds */
const asMs = (t) => (t > 1e12 ? t : t * 1000);
const after = frames
  .map((f) => ({ t: asMs(f.t), data: f.data }))
  .filter((f) => f.t >= navTime && f.data)
  .map((f) => ({ ms: Math.round(f.t - navTime), data: f.data }))
  .sort((a, b) => a.ms - b.ms);

const picked = TARGETS.map((target) => {
  let best = after[0];
  if (!best) return { target, ms: null, data: null };
  for (const f of after) if (Math.abs(f.ms - target) < Math.abs(best.ms - target)) best = f;
  return { target, ...best };
});

for (const p of picked) {
  if (!p.data) continue;
  const file = `${OUT}/${W}-${MODE === "back" ? "back" : "t"}${p.target}.png`;
  fs.writeFileSync(file, Buffer.from(p.data, "base64"));
}
console.log(
  JSON.stringify(
    {
      navAt: Math.round(navTime),
      captured: after.length,
      span: after.length ? [after[0].ms, after[after.length - 1].ms] : null,
      picked: picked.map((p) => ({ target: p.target, actual: p.ms })),
    },
    null,
    2
  )
);
await browser.close();
