import { chromium } from "@playwright/test";

/* contrast.mjs — the chip / switch / danger-text contrast table, computed on
   the live freelancer settings page. Text tokens only: every colour below is
   the element's own color over its real composited background. */

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5173/signin", { waitUntil: "domcontentloaded" });
await p.evaluate(() => {
  const s = JSON.stringify({ email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now() });
  localStorage.setItem("vl.dash.session", s);
  sessionStorage.setItem("vl.dash.session", s);
});
await p.goto("http://127.0.0.1:5173/dashboard/settings", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2600);

const out = await p.evaluate(() => {
  const lum = (r, g, bl) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const parse = (c) => {
    const m = c.match(/rgba?\(([\d.]+)[,\s] ([\d.]+)[,\s] ([\d.]+)(?:[,\s] ([\d.]+))?\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const over = (fg, bg) => {
    if (!bg || bg[3] === 1) return bg;
    const a = bg[3];
    return [0, 1, 2].map((i) => bg[i] * a + fg[i] * (1 - a)).concat([1]);
  };
  /* the element's own tint, composited over every ancestor up to <body> */
  const bgOf = (el) => {
    const layers = [];
    let n = el;
    while (n && n !== document.body) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) layers.unshift(c);
      n = n.parentElement;
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1];
    for (const layer of layers) base = over(base, layer);
    return base;
  };
  const ratioOf = (el) => {
    const fg = parse(getComputedStyle(el).color);
    if (!fg) return null;
    const bg = bgOf(el);
    const L1 = lum(fg[0], fg[1], fg[2]);
    const L2 = lum(bg[0], bg[1], bg[2]);
    return +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2);
  };
  const pick = (sel, label) => {
    const el = document.querySelector(sel);
    if (!el) return { label, sel, missing: true };
    return { label, sel, ratio: ratioOf(el), color: getComputedStyle(el).color };
  };
  return [
    pick(".set-chip-freelancer", "FREELANCER chip (profile + summary)"),
    pick(".set-chip-client", "CLIENT chip (comparison, unchanged)"),
    pick(".set-switch[data-on='1']", "Switch, on (track+tint)"),
    pick('[data-testid="payout-status-chip"]', "Verified/Not-set chip"),
    pick(".set-notif-desc", "Notification row description"),
    pick(".set-danger-h", "Danger: Export my data heading"),
    pick('.set-card[data-section="danger"] .set-card-cap', "Danger card caption"),
    pick(".set-block-sub", "Danger sub copy"),
    pick(".set-hint", "Helper hint (payout field)"),
    pick(".dash-plain-h", "NotAvailable/404 heading"),
  ];
});

console.log(JSON.stringify(out, null, 1));
await b.close();
