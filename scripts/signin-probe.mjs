/* scratch probe for /signin — measurements only */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

await page.goto(`${URL}/signin`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const m = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const r = (s) => {
    const el = q(s);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
  };
  const cs = (s, p) => {
    const el = q(s);
    return el ? getComputedStyle(el)[p] : null;
  };
  return {
    h1: q(".signin-h1")?.textContent,
    status: q('[data-testid="signin-status"]')?.textContent,
    card: r(".signin-card"),
    cardCenterPct: q(".signin-card")
      ? +(((q(".signin-card").getBoundingClientRect().left + q(".signin-card").getBoundingClientRect().width / 2) / innerWidth) * 100).toFixed(2)
      : null,
    cardMidY: q(".signin-card")
      ? +(((q(".signin-card").getBoundingClientRect().top + q(".signin-card").getBoundingClientRect().height / 2) / innerHeight) * 100).toFixed(2)
      : null,
    inputH: r("#signin-email")?.h,
    pwH: r("#signin-password")?.h,
    btnH: r('[data-testid="signin-submit"]')?.h,
    cardBg: cs(".signin-card", "backgroundColor"),
    cardBlur: cs(".signin-card", "backdropFilter"),
    cardBorder: cs(".signin-card", "borderTopColor"),
    radius: cs(".signin-card", "borderRadius"),
    vaultX: getComputedStyle(q(".vault-shift")).getPropertyValue("--vault-x"),
    scrollW: document.documentElement.scrollWidth,
    innerW: innerWidth,
    keypadCanvasOpacity: getComputedStyle(q('[data-testid="keypad-clip"]')).opacity,
  };
});
console.log(JSON.stringify(m, null, 2));
console.log("logs:", logs.slice(0, 12));
await page.screenshot({ path: "C:/Users/pc/AppData/Local/Temp/signin-1440.png" });
await browser.close();
