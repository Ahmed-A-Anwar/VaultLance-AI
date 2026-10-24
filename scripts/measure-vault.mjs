/* measure-vault.mjs — locate the vault body inside f_001.webp.
   Reports the bounding box as a fraction of the frame, at two thresholds so the
   soft contact shadow can be told apart from the solid body. */

import sharp from "sharp";

const SRC = "public/vault-frames/f_001.webp";

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* the page background is a near-neutral light gradient; sample its level from
   the outermost ring so the threshold adapts to the frame */
let ringSum = 0;
let ringN = 0;
const ring = Math.round(Math.min(width, height) * 0.03);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (x > ring && x < width - ring && y > ring && y < height - ring) continue;
    const i = (y * width + x) * channels;
    ringSum += lum(data[i], data[i + 1], data[i + 2]);
    ringN++;
  }
}
const bg = ringSum / ringN;

function boxAt(cutoff) {
  let minX = width, minY = height, maxX = -1, maxY = -1, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const l = lum(data[i], data[i + 1], data[i + 2]);
      /* the vault is darker than the backdrop; alpha keeps it off the edges */
      const alpha = channels === 4 ? data[i + 3] : 255;
      if (alpha < 8) continue;
      if (l >= cutoff) continue;
      n++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return {
    pixels: n,
    left: minX, top: minY, right: maxX, bottom: maxY,
    w: maxX - minX + 1, h: maxY - minY + 1,
    fx: +(minX / width).toFixed(4),
    fy: +(minY / height).toFixed(4),
    fw: +((maxX - minX + 1) / width).toFixed(4),
    fh: +((maxY - minY + 1) / height).toFixed(4),
    cx: +(((minX + maxX) / 2) / width).toFixed(4),
    cy: +(((minY + maxY) / 2) / height).toFixed(4),
  };
}

const report = {
  frame: { width, height, aspect: +(width / height).toFixed(4), backgroundLum: +bg.toFixed(1) },
  /* solid body: a firm 22% below the backdrop, drops the soft shadow */
  body: boxAt(bg * 0.78),
  /* loose: anything measurably darker, includes the contact shadow */
  loose: boxAt(bg * 0.97),
};

console.log(JSON.stringify(report, null, 2));
