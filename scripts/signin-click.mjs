/* scratch: hero Sign in -> /signin, measure the keypad hold */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));

await page.goto(`${URL}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(5200);

const sample = () =>
  page.evaluate(() => {
    const base = document.querySelector(".hero-canvas");
    const rectEl = document.querySelector(".hero-rect");
    const kp = document.querySelector(".hero-keypad");
    const box = rectEl?.getBoundingClientRect();
    const k = kp?.getBoundingClientRect();
    let cyan = null;
    let avg = null;
    if (base && box && k) {
      const cr = base.getBoundingClientRect();
      const dpr = base.width / cr.width;
      const ctx = base.getContext("2d");
      const x = Math.round((k.left + k.width / 2 - cr.left) * dpr);
      const y = Math.round((k.top + k.height / 2 - cr.top) * dpr);
      const d = ctx.getImageData(x - 20, y - 20, 40, 40).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      const n = d.length / 4;
      avg = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
      cyan = Math.round(b / n - r / n);
    }
    const clip = document.querySelector('[data-testid="keypad-clip"]');
    let clipCyan = null;
    if (clip && box && k) {
      const cr = clip.getBoundingClientRect();
      const dpr = clip.width / cr.width;
      const ctx = clip.getContext("2d");
      const x = Math.round((k.left + k.width / 2 - cr.left) * dpr);
      const y = Math.round((k.top + k.height / 2 - cr.top) * dpr);
      const d = ctx.getImageData(Math.max(0, x - 20), Math.max(0, y - 20), 40, 40).data;
      let r = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; b += d[i + 2]; }
      clipCyan = Math.round((b - r) / (d.length / 4));
    }
    return {
      clipCyan,
      url: location.pathname,
      vaultX: getComputedStyle(document.querySelector(".vault-shift")).getPropertyValue("--vault-x").trim(),
      keypadAvg: avg,
      cyanBias: cyan,
      clipOpacity: getComputedStyle(document.querySelector('[data-testid="keypad-clip"]')).opacity,
      clipVis: document.querySelector('[data-testid="keypad-clip"]').style.opacity,
      card: !!document.querySelector('[data-testid="signin-card"]'),
      cardOpacity: document.querySelector('[data-testid="signin-card"]')
        ? getComputedStyle(document.querySelector('[data-testid="signin-card"]')).opacity
        : null,
      cardX: document.querySelector('[data-testid="signin-card"]')
        ? Math.round(document.querySelector('[data-testid="signin-card"]').getBoundingClientRect().x)
        : null,
      flatKeys: [...document.querySelectorAll(".hero-keypad-key")].map((el) => +getComputedStyle(el).opacity),
      keypadHidden: getComputedStyle(document.querySelector(".hero-keypad")).visibility,
    };
  });

console.log("before click", JSON.stringify(await sample()));

/* hover then click the Sign in CTA */
await page.hover('[data-testid="hero-signin"]');
await page.waitForTimeout(500);
await page.click('[data-testid="hero-signin"]');

const t0 = Date.now();
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(100);
  const p = await page.evaluate(() => location.pathname);
  if (p === "/signin") break;
}
console.log("navigated in", Date.now() - t0, "ms");
await page.waitForTimeout(400);
console.log("after arrival", JSON.stringify(await sample()));
await page.waitForTimeout(2000);
console.log("later", JSON.stringify(await sample()));
console.log("logs", logs.filter((l) => !l.includes("vite")).slice(0, 10));
await page.screenshot({ path: "C:/Users/pc/AppData/Local/Temp/arrive-signin.png" });
await browser.close();
