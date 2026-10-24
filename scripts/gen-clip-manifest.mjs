/* gen-clip-manifest.mjs — the browser cannot list public/ at runtime, so the
   keypad clip URLs are generated here. Files are sorted numerically and URL
   encoded once (the folder name contains a space). */

import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE_DIR = "public/Keypad frames";
const OUT_FILE = "src/config/keypad-manifest.json";
const PATTERN = /^ezgif-frame-(\d+)\.webp$/i;

const frameNumber = (name) => Number(name.match(PATTERN)[1]);

const urls = [];
if (existsSync(SOURCE_DIR)) {
  const files = readdirSync(SOURCE_DIR)
    .filter((name) => PATTERN.test(name))
    .sort((a, b) => frameNumber(a) - frameNumber(b));
  const folder = "/" + encodeURIComponent(SOURCE_DIR.replace(/^public\//, "").replace(/\\/g, "/"));
  for (const name of files) urls.push(`${folder}/${encodeURIComponent(name)}`);
} else {
  console.warn(`[gen-clip-manifest] ${SOURCE_DIR} not found — writing an empty manifest`);
}

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(urls, null, 2) + "\n");
console.log(`[gen-clip-manifest] ${urls.length} keypad frames -> ${OUT_FILE}`);
