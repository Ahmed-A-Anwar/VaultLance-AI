import sharp from "sharp";
import { mkdir } from "node:fs/promises";

await mkdir("docs/hero-shots/small", { recursive: true });
const files = ["t0-1440", "t2618-1440", "hover-signup-1440", "hover-signin-1440", "final-375", "final-768", "final-1024"];
for (const f of files) {
  await sharp(`docs/hero-shots/${f}.png`).resize({ width: 960 }).png({ quality: 80 }).toFile(`docs/hero-shots/small/${f}.png`);
}
console.log("ok");
