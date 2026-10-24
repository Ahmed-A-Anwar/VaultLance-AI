import sharp from "sharp";

const file = "public/vault-frames/f_001.webp";
const meta = await sharp(file).metadata();

// measured on the real frame: handwheel hub + spokes + rim
const cx = 1028;
const cy = 537;
const r = 68;
const size = r * 2;
const left = Math.round(cx - r);
const top = Math.round(cy - r);

const crop = await sharp(file)
  .extract({ left, top, width: size, height: size })
  .toBuffer();

/* feathered alpha: opaque to 96% of the radius, fading out over the last 4% */
const mask = Buffer.from(`
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="m">
        <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
        <stop offset="88%" stop-color="#fff" stop-opacity="1"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#m)"/>
  </svg>`);

const out = await sharp(crop)
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toFile("public/vault-frames/wheel.png");

console.log({
  frame: { W: meta.width, H: meta.height },
  crop: { left, top, size },
  centerPct: { x: +((cx / meta.width) * 100).toFixed(2), y: +((cy / meta.height) * 100).toFixed(2) },
  sizePctOfWidth: +(((r * 2) / meta.width) * 100).toFixed(2),
  out,
});
