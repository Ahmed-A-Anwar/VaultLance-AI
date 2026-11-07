/**
 * make-playground-samples.mjs — writes the archives the playground ships.
 *
 * Run from backend/: `node scripts/make-playground-samples.mjs`. The output is
 * committed, so the API never depends on a build-time zip tool.
 */
import AdmZip from "adm-zip";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

const out = path.resolve(process.cwd(), "playground-samples");
await fs.mkdir(out, { recursive: true });

const logoPng = await sharp({
  create: { width: 512, height: 512, channels: 4, background: { r: 12, g: 30, b: 54, alpha: 1 } },
})
  .composite([
    {
      input: Buffer.from(
        `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
          <rect x="96" y="96" width="320" height="320" rx="56" fill="#e7c27d"/>
          <path d="M176 348V164h44l72 108V164h44v184h-44l-72-108v108z" fill="#0c1e36"/>
        </svg>`
      ),
      top: 0,
      left: 0,
    },
  ])
  .png()
  .toBuffer();

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#0c1e36"/><path d="M176 348V164h44l72 108V164h44v184h-44l-72-108v108z" fill="#e7c27d"/></svg>`;

const completeApp = new AdmZip();
completeApp.addFile(
  "index.html",
  Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Northwind Booking</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Northwind Booking</h1><p>Browse rooms, reserve a night, pay once.</p><button id="book">Reserve a room</button><p id="status">Ready</p></main><script src="app.js"></script></body></html>`)
);
completeApp.addFile(
  "app.js",
  Buffer.from(`const status = document.querySelector("#status");\ndocument.querySelector("#book").addEventListener("click", () => { status.textContent = "Reserved — confirmation NW-1042"; });\n`)
);
completeApp.addFile(
  "styles.css",
  Buffer.from(`:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c1e36;color:#f4ead8;font:16px/1.5 system-ui}main{max-width:38rem;padding:4rem}h1{font-size:clamp(2rem,6vw,4rem);margin:0 0 1rem}button{border:0;border-radius:999px;padding:.9rem 1.4rem;background:#e7c27d;color:#0c1e36;font-weight:700;cursor:pointer}`)
);
completeApp.addFile("README.md", Buffer.from(`# Northwind Booking\n\nA complete sample web app.\n\n- Browse rooms and reserve a night.\n- Confirmation code after checkout.\n- Tests: see tests/report.xml.\n`));
completeApp.addFile("tests/report.xml", Buffer.from(`<testsuite tests="12" failures="0" errors="0" skipped="0" time="1.42"></testsuite>\n`));
await fs.writeFile(path.join(out, "complete-web-app.zip"), completeApp.toBuffer());

const incompleteApp = new AdmZip();
incompleteApp.addFile(
  "index.html",
  Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Northwind Booking — late build</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Northwind Booking</h1><p>Browse rooms and reserve a night.</p><button id="book">Reserve a room</button><p id="status">Checkout not wired</p></main><script src="app.js"></script></body></html>`)
);
incompleteApp.addFile(
  "app.js",
  Buffer.from(`const status = document.querySelector("#status");\ndocument.querySelector("#book").addEventListener("click", () => { status.textContent = "TODO: connect checkout"; });\n`)
);
incompleteApp.addFile(
  "styles.css",
  Buffer.from(`body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c1e36;color:#f4ead8;font:16px/1.5 system-ui}main{max-width:38rem;padding:4rem}h1{font-size:clamp(2rem,6vw,4rem)}button{border:0;border-radius:999px;padding:.9rem 1.4rem;background:#e7c27d;color:#0c1e36;font-weight:700}`)
);
await fs.writeFile(path.join(out, "incomplete-web-app.zip"), incompleteApp.toBuffer());

const logoPack = new AdmZip();
logoPack.addFile("logo-primary.svg", Buffer.from(logoSvg));
logoPack.addFile("logo-primary.png", logoPng);
logoPack.addFile("brand-guide.txt", Buffer.from("Northwind identity\nPrimary: #0c1e36\nAccent: #e7c27d\nClear space: 8%\n"));
await fs.writeFile(path.join(out, "logo-pack.zip"), logoPack.toBuffer());

await fs.writeFile(
  path.join(out, "complete-README.md"),
  Buffer.from(`# Northwind Booking\n\nA complete web-app delivery with its logo pack.\n\n## Run\n\nOpen \`index.html\`, or serve the folder offline.\n\n## Package\n\n- \`northwind-web-app.zip\` — source, tests and the run notes.\n- \`northwind-logo-pack.zip\` — primary mark in SVG and PNG, plus the brand guide.\n\nAll 12 integration checks pass in \`test-log.txt\`.\n`)
);
await fs.writeFile(
  path.join(out, "complete-test-log.txt"),
  Buffer.from(`<testsuite name="northwind" tests="12" failures="0" errors="0" skipped="0" time="1.42"></testsuite>\n`)
);
await fs.writeFile(
  path.join(out, "incomplete-test-log.txt"),
  Buffer.from(`<testsuite name="northwind" tests="12" failures="3" errors="1" skipped="0" time="2.08"></testsuite>\n`)
);

console.log("wrote playground samples to", out);
