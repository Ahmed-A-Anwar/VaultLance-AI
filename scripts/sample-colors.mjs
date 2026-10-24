import sharp from "sharp";
const file = "public/vault-frames/f_001.webp";
const { data, info } = await sharp(file)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const px = (xp, yp) => {
  const x = Math.min(width - 1, Math.round(width * xp));
  const y = Math.min(height - 1, Math.round(height * yp));
  const i = (y * width + x) * channels;
  return "#" + [data[i], data[i + 1], data[i + 2]]
    .map(v => v.toString(16).padStart(2, "0")).join("");
};
console.log({ width, height, channels,
  topLeft: px(0.03, 0.03), topRight: px(0.97, 0.03),
  midLeft: px(0.03, 0.5), midRight: px(0.97, 0.5),
  bottomLeft: px(0.03, 0.97), bottomRight: px(0.97, 0.97) });
