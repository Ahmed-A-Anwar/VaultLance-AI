import { chromium } from "@playwright/test";

const b = await chromium.launch();
for (const [w, h] of [[768, 1024], [1024, 768]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  await p.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__shifts.push({
          v: +e.value.toFixed(4),
          t: Math.round(e.startTime),
          src: (e.sources || []).map((s) => {
            const n = s.node;
            return n ? `${n.tagName}.${String(n.className || "").slice(0, 24)}` : "detached";
          }),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await p.goto("http://127.0.0.1:5180/", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  console.log(w, JSON.stringify(await p.evaluate(() => window.__shifts.slice(0, 12))));
  await p.close();
}
await b.close();
