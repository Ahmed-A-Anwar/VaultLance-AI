/* Measure: LCP on the landing + WCAG 2.x contrast for the token palette pairs. */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "load" });
await page.waitForSelector(".reveal", { timeout: 10_000 });
const lcp = await page.evaluate(() => new Promise<number>((res) => {
  const po = new PerformanceObserver((list) => {
    const es = list.getEntries();
    const last = es[es.length - 1];
    res(Math.round(last.startTime));
  });
  po.observe({ type: "largest-contentful-paint", buffered: true });
  setTimeout(() => res(-1), 5000);
}));
const ttfb = await page.evaluate(() => performance.timing.responseStart - performance.timing.navigationStart);
console.log("LCP(ms):", lcp, "TTFB(ms):", ttfb);
await browser.close();

// contrast — from src/styles/tokens.css
const css = readFileSync("src/styles/tokens.css", "utf8");
const hex = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*#([0-9a-fA-F]{3,6})`));
  return m ? m[1] : null;
};
const lum = (h) => {
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const to = (i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * to(0) + 0.7152 * to(2) + 0.0722 * to(4);
};
const ratio = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
};
const pairs = [
  ["ink on paper", "ink", "paper"],
  ["ink on panel", "ink", "panel"],
  ["muted on paper", "muted", "paper"],
  ["paid on paper", "paid", "paper"],
  ["warn-ink on warn-bg", "warn-ink", "warn-bg"],
  ["paper on ink (buttons)", "paper", "ink"],
];
console.log("contrast ratios:");
for (const [label, f, b] of pairs) {
  const fv = hex(f), bv = hex(b);
  console.log(`  ${label}: ${fv && bv ? ratio(fv, bv) : "MISSING TOKEN"}  (${f} on ${b})`);
}
