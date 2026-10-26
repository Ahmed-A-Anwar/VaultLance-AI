/* gen-clip-manifest.mjs — the browser cannot list public/ at runtime, so the
   clip URLs are generated here. Files are sorted numerically and URL encoded
   once (a folder name can contain a space).

   Both clips are listed so the entry gate knows how many frames it is waiting
   for before the first byte of the clip is requested: a total discovered by
   probing arrives late, and until it does the gate can only report "unknown". */

import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PATTERN = /^ezgif-frame-(\d+)\.webp$/i;

const CLIPS = [
  { dir: "public/wheel-turn", out: "src/config/wheel-manifest.json", label: "wheel" },
  { dir: "public/Keypad frames", out: "src/config/keypad-manifest.json", label: "keypad" },
];

const frameNumber = (name) => Number(name.match(PATTERN)[1]);

for (const { dir: sourceDir, out, label } of CLIPS) {
  const urls = [];
  if (existsSync(sourceDir)) {
    const files = readdirSync(sourceDir)
      .filter((name) => PATTERN.test(name))
      .sort((a, b) => frameNumber(a) - frameNumber(b));
    const folder = "/" + encodeURIComponent(sourceDir.replace(/^public\//, "").replace(/\\/g, "/"));
    for (const name of files) urls.push(`${folder}/${encodeURIComponent(name)}`);
  } else {
    console.warn(`[gen-clip-manifest] ${sourceDir} not found — writing an empty manifest`);
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(urls, null, 2) + "\n");
  console.log(`[gen-clip-manifest] ${urls.length} ${label} frames -> ${out}`);
}
