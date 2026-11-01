import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "docs/hero-shots/opsz-compare.png";
fs.mkdirSync("docs/hero-shots", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(4500);

const shots = [];
for (const opsz of [24, 36, 48, 72]) {
  await page.addStyleTag({ content: `.hero-h1{font-variation-settings:"opsz" ${opsz},"WONK" 0 !important}` });
  await page.waitForTimeout(350);
  const box = await page.locator(".hero-h1").boundingBox();
  const buf = await page.screenshot({
    clip: { x: 60, y: Math.max(0, box.y - 16), width: 900, height: box.height + 32 },
  });
  shots.push({ opsz, data: buf.toString("base64"), h: Math.ceil(box.height + 32), w: 900 });
  console.log("captured opsz", opsz, "h1 box", Math.round(box.width) + "x" + Math.round(box.height));
}

/* compose: one strip per opsz, the value in the mono face, same crop */
const b64 = await page.evaluate(
  async ({ shots }) => {
    const LABEL = 34;
    const W = 900;
    const H = shots.reduce((n, s) => n + s.h + LABEL, 0);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#e1e7e8";
    ctx.fillRect(0, 0, W, H);
    let y = 0;
    for (const s of shots) {
      const img = new Image();
      img.src = `data:image/png;base64,${s.data}`;
      await img.decode();
      ctx.drawImage(img, 0, y, W, s.h);
      ctx.fillStyle = "#0e1520";
      ctx.font = "500 14px 'Hero JetBrains Mono', monospace";
      ctx.fillText(`opsz ${s.opsz}${s.opsz === 36 ? "  (in use)" : ""}`, 12, y + s.h + 22);
      y += s.h + LABEL;
    }
    return c.toDataURL("image/png").split(",")[1];
  },
  { shots }
);
fs.writeFileSync(OUT, Buffer.from(b64, "base64"));
console.log(OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + "KB");
await browser.close();
