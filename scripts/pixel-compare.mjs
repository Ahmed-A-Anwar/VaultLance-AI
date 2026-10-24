/* pixel-compare.mjs — diff two PNGs and report any difference.
   usage: node scripts/pixel-compare.mjs a.png b.png */

import sharp from "sharp";

const [, , aPath, bPath] = process.argv;
if (!aPath || !bPath) {
  console.error("usage: node scripts/pixel-compare.mjs a.png b.png");
  process.exit(2);
}

async function raw(p) {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, ...info };
}

const a = await raw(aPath);
const b = await raw(bPath);

if (a.width !== b.width || a.height !== b.height) {
  console.log(JSON.stringify({ ok: false, reason: "size", a: [a.width, a.height], b: [b.width, b.height] }));
  process.exit(1);
}

let diffPixels = 0;
let maxDelta = 0;
let totalDelta = 0;
const ch = a.channels;

for (let i = 0; i < a.data.length; i += ch) {
  let px = 0;
  for (let c = 0; c < ch; c++) {
    const d = Math.abs(a.data[i + c] - b.data[i + c]);
    if (d > px) px = d;
    totalDelta += d;
  }
  if (px > 0) diffPixels++;
  if (px > maxDelta) maxDelta = px;
}

const out = {
  ok: diffPixels === 0,
  size: [a.width, a.height],
  diffPixels,
  diffPct: +((diffPixels / (a.width * a.height)) * 100).toFixed(4),
  maxChannelDelta: maxDelta,
  meanChannelDelta: +(totalDelta / (a.width * a.height * ch)).toFixed(4),
};
console.log(JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
