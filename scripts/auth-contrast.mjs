/* auth-contrast.mjs — the ratios the reset screens actually render. The card is
   glass over a gradient, so the background is sampled from a screenshot rather
   than guessed: one pixel inside the card, one inside each button's fill. */

import { chromium } from "playwright";
import sharp from "sharp";

const base = process.env.BASE ?? "http://127.0.0.1:5173";

const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  Math.random = () => 0.9;
});
await page.goto(`${base}/forgot-password`);
await page.waitForTimeout(900);

const at = async (x, y) => {
  const buf = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
};

const card = await page.evaluate(() => {
  const c = document.querySelector(".auth-card").getBoundingClientRect();
  const primary = document.querySelector('[data-testid="forgot-submit"]').getBoundingClientRect();
  return { c: { x: c.x, y: c.y, w: c.width, h: c.height }, p: { x: primary.x, y: primary.y, w: primary.width, h: primary.height } };
});

/* inside the card's padding, above the dev banner: glass, no text on it */
const cardBg = await at(card.c.x + card.c.w - 21, card.c.y + card.c.h - 120);
/* the primary button's fill at its darkest (the gradient runs light to dark) */
const brassBg = await at(card.p.x + card.p.w - 13, card.p.y + card.p.h - 8);

/* the glass secondary, from the sent state */
await page.locator("#forgot-email").fill("a@b.co");
await page.getByTestId("forgot-submit").click();
await page.getByTestId("forgot-sent").waitFor();
await page.waitForTimeout(600);
const glassRect = await page.evaluate(() => {
  const b = document.querySelector('[data-testid="sent-resend"]').getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});
const glassBg = await at(glassRect.x + glassRect.w - 21, glassRect.y + glassRect.h - 8);

const rows = [
  ["ink #0E1520 on the card", hex("#0e1520"), cardBg],
  ["slate #4B5663 on the card", hex("#4b5663"), cardBg],
  ["teal text #09636F on the card", hex("#09636f"), cardBg],
  ["brass text #7A551A on the card", hex("#7a551a"), cardBg],
  ["success text #0F6B49 on the card", hex("#0f6b49"), cardBg],
  ["danger text #9B1C16 on the card", hex("#9b1c16"), cardBg],
  ["ink on the brass fill", hex("#0e1520"), brassBg],
  ["ink on the glass fill", hex("#0e1520"), glassBg],
  ["steel #8A95A1 dot (graphic) on the card", hex("#8a95a1"), cardBg],
];

console.log(`card bg rgb(${cardBg.join(",")})  brass fill rgb(${brassBg.join(",")})  glass fill rgb(${glassBg.join(",")})`);
for (const [label, fg, bg] of rows) {
  console.log(`${ratio(fg, bg).toFixed(2)}:1\t${label}`);
}

await browser.close();
