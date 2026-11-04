import { chromium } from "@playwright/test";
import sharp from "sharp";

/* contrast2.mjs — the chip / switch / danger-text contrast table against the
   REAL painted pixels. The shell paints an image behind the glass, so textbook
   backgroundColor walking is wrong here: this crops each element out of a
   fresh screenshot, takes the crop's background mode (the dominant colour,
   which is the surface, not the glyphs) and contrasts the element's own text
   colour against it. Text tokens only. */

const B = {
  lum(r, g, bl) {
    const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  },
  ratio(fg, bg) {
    const l1 = B.lum(...fg);
    const l2 = B.lum(...bg);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
  },
  parse(c) {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  },
};

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.setDefaultTimeout(8000);
await p.goto("http://127.0.0.1:5173/signin", { waitUntil: "domcontentloaded" });
await p.evaluate(() => {
  const s = JSON.stringify({ email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now() });
  localStorage.setItem("vl.dash.session", s);
  sessionStorage.setItem("vl.dash.session", s);
});
await p.goto("http://127.0.0.1:5173/dashboard/settings", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2600);

/* below-the-fold targets are scrolled into view one at a time, each with its
   own screenshot, so no crop can land outside the viewport */
const targetSpecs = [
  [".set-chip-freelancer", "FREELANCER chip (profile)"],
  ['[data-testid="summary-role"]', "FREELANCER chip (summary)"],
  ['[data-testid="payout-status-chip"]', "VERIFIED chip"],
  [".set-switch[data-on='1']", "Switch track (on): the payload ink"],
  ['.set-card[data-section="danger"] .set-card-cap', "Danger caption"],
  [".set-block-sub", "Danger sub copy"],
];

const rows = [];
for (const [css, label] of targetSpecs) {
  process.stdout.write(`measuring ${label}... `);
  const el = p.locator(css).first();
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  const target = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return {
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      color: getComputedStyle(node).color,
    };
  });
  if (!target || target.box[2] === 0) continue;
  await p.screenshot({ path: ".shots/fsettings/contrast-raw.png" });

  const img = sharp(".shots/fsettings/contrast-raw.png");
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (Math.max(0, Math.min(info.height - 1, y)) * info.width + Math.max(0, Math.min(info.width - 1, x))) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const [x, y, w, h] = target.box;
  const counts = new Map();
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const [r, g, bl] = px(xx, yy);
      const key = `${Math.round(r / 8)},${Math.round(g / 8)},${Math.round(bl / 8)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let mode = "";
  let best = 0;
  for (const [k, n] of counts) {
    if (n > best) {
      best = n;
      mode = k;
    }
  }
  const bg = mode.split(",").map((v) => Math.min(255, +v * 8 + 4));
  const fg = B.parse(target.color);
  rows.push({
    label,
    text: target.color,
    bgSampled: `rgb(${bg.join(",")})`,
    ratio: B.ratio(fg, bg),
  });
}
console.log(JSON.stringify(rows, null, 1));
