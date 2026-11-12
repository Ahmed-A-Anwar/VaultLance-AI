#!/usr/bin/env node
/**
 * demo-fixtures/build.mjs — the two uploaded packages for the demo.
 *
 * v1 is missing contact.html and its test log records that failure, so the
 * "Test log" check fails from the file itself (the deterministic checks read
 * the JUnit summary; they never render HTML, so "missing page" alone is not
 * something the audit can see).
 * v2 restores the page and the log passes.
 *
 * Content is original, fictional and self-contained. Output: scripts/demo-fixtures/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const AdmZip = require("adm-zip");
const sharp = require("sharp");

/* fileURLToPath, not .pathname: a percent-encoded space would create a folder
   called "Vaultpay%20ai" next to the project instead of writing here */
const OUT = path.dirname(fileURLToPath(import.meta.url));
const BRAND = { ink: "#2b1c14", cream: "#f6efe6", bean: "#6b3f22", accent: "#c8763f" };
const PAGES = ["index", "menu", "about", "gallery", "contact"];

const css = `:root{--ink:${BRAND.ink};--cream:${BRAND.cream};--bean:${BRAND.bean};--accent:${BRAND.accent}}
*{box-sizing:border-box}body{margin:0;font-family:Georgia,"Times New Roman",serif;background:var(--cream);color:var(--ink)}
header{display:flex;align-items:center;gap:18px;padding:22px 48px;border-bottom:1px solid #e2d5c6}
header img{width:44px;height:44px}
nav{display:flex;gap:20px;margin-left:auto}
nav a{color:var(--bean);text-decoration:none;font-size:15px;letter-spacing:.02em}
nav a[aria-current="page"]{color:var(--ink);border-bottom:2px solid var(--accent)}
main{max-width:920px;margin:0 auto;padding:64px 32px}
h1{font-size:52px;line-height:1.05;margin:0 0 18px}
p.lede{font-size:20px;color:#5a4638;max-width:56ch}
section{margin-top:44px}
.card{border:1px solid #e2d5c6;border-radius:14px;padding:22px;background:#fffdf9}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
.price{font-weight:700}
footer{padding:36px 48px;border-top:1px solid #e2d5c6;color:#7a6555;font-size:14px}
label{display:block;margin:14px 0 6px;font-size:14px}
input,textarea{width:100%;padding:11px 12px;border:1px solid #d8c8b6;border-radius:8px;background:#fff}
button{margin-top:18px;padding:12px 22px;border:0;border-radius:999px;background:var(--bean);color:#fff;font-size:15px;cursor:pointer}
`;

const nav = (current) =>
  PAGES.filter((p) => p !== "contact" || current === "v1")
    .map(
      (p) =>
        `<a href="${p}.html"${p === current ? ' aria-current="page"' : ""}>${
          p[0].toUpperCase() + p.slice(1)
        }</a>`
    )
    .join("\n      ");

const page = (title, current, body, hasContact = true) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Corner Bean Coffee</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <img src="assets/logo.png" alt="Corner Bean Coffee logo">
    <strong>Corner Bean Coffee</strong>
    <nav>
      ${hasContact ? nav(current) : ["index", "menu", "about", "gallery"].map((p) => `<a href="${p}.html"${p === current ? ' aria-current="page"' : ""}>${p[0].toUpperCase() + p.slice(1)}</a>`).join("\n      ")}
    </nav>
  </header>
  <main>
${body}
  </main>
  <footer>Corner Bean Coffee · 14 Lantern Lane · Open 7am–6pm · A fictional shop for this demo.</footer>
</body>
</html>
`;

const pages = {
  index: page(
    "Home",
    "index",
    `    <h1>Slow mornings,<br>honest coffee.</h1>
    <p class="lede">A corner shop that roasts in small batches and knows your order by the second visit. This site is the delivery for the VaultLance demo.</p>
    <section class="grid">
      <div class="card"><h2>Single origin</h2><p>Rotating beans from three farms.</p></div>
      <div class="card"><h2>Baked here</h2><p>Cardamom buns, every morning at seven.</p></div>
      <div class="card"><h2>Stay a while</h2><p>Twelve seats, no music after noon.</p></div>
    </section>`
  ),
  menu: page(
    "Menu",
    "menu",
    `    <h1>Menu</h1>
    <p class="lede">Six drinks, one grinder, no syrups.</p>
    <section class="grid">
      <div class="card"><h3>Filter</h3><p class="price">$3.50</p></div>
      <div class="card"><h3>Flat white</h3><p class="price">$4.20</p></div>
      <div class="card"><h3>Cortado</h3><p class="price">$3.90</p></div>
      <div class="card"><h3>Cold brew</h3><p class="price">$4.60</p></div>
      <div class="card"><h3>Cardamom latte</h3><p class="price">$4.80</p></div>
      <div class="card"><h3>Drinking chocolate</h3><p class="price">$4.10</p></div>
    </section>`
  ),
  about: page(
    "About",
    "about",
    `    <h1>About the shop</h1>
    <p class="lede">Corner Bean opened in 2019 in a former key-cutting shop. The counter is the original wood.</p>
    <section><p>We roast on Tuesdays, bake before opening, and close early on the first Sunday of the month.</p></section>`
  ),
  gallery: page(
    "Gallery",
    "gallery",
    `    <h1>Gallery</h1>
    <p class="lede">Three frames from the counter.</p>
    <section class="grid">
      <img src="assets/logo.png" alt="Corner Bean Coffee mark" width="240" height="240">
      <div class="card"><p>The grinder, mid-morning.</p></div>
      <div class="card"><p>Buns cooling by the window.</p></div>
    </section>`
  ),
  contact: page(
    "Contact",
    "contact",
    `    <h1>Contact</h1>
    <p class="lede">14 Lantern Lane. Open 7am–6pm, every day.</p>
    <section class="card">
      <form>
        <label for="name">Name</label>
        <input id="name" name="name" autocomplete="off">
        <label for="message">Message</label>
        <textarea id="message" name="message" rows="4"></textarea>
        <button type="button">Send</button>
      </form>
    </section>`
  ),
};

const readme = `# Corner Bean Coffee — website delivery

A five-page static site (HTML + CSS) for a fictional coffee shop.

## Pages
- index.html — home
- menu.html — drinks and prices
- about.html — the shop
- gallery.html — three frames
- contact.html — address, hours, form

## Run it
Open \`index.html\` in a browser. No build step, no dependencies.

## Notes
The contact form has no backend; it is a layout only. All names, prices and
addresses are fictional and exist to exercise the audit checks.
`;

const testLog = (contactPasses) => `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="corner-bean-site" tests="6" failures="${contactPasses ? 0 : 1}" errors="0" skipped="0">
  <testcase name="index.html is present"/>
  <testcase name="menu.html is present"/>
  <testcase name="about.html is present"/>
  <testcase name="gallery.html is present"/>
  <testcase name="stylesheet is present"/>
  <testcase name="contact.html is present">${
    contactPasses ? "" : '\n    <failure message="contact.html is missing from the package">ENOENT: contact.html</failure>'
  }</testcase>
</testsuite>
`;

async function logo() {
  return sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 43, g: 28, b: 20, alpha: 1 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="256" height="256"><circle cx="128" cy="128" r="78" fill="none" stroke="${BRAND.accent}" stroke-width="10"/><path d="M96 96c0 44 24 64 64 64" fill="none" stroke="${BRAND.cream}" stroke-width="12" stroke-linecap="round"/></svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

function build(version, contactPasses) {
  const zip = new AdmZip();
  zip.addFile("README.md", Buffer.from(readme));
  zip.addFile("styles.css", Buffer.from(css));
  zip.addFile("test-log.txt", Buffer.from(testLog(contactPasses)));
  for (const name of Object.keys(pages)) {
    if (name === "contact" && !contactPasses) continue;
    zip.addFile(`${name}.html`, Buffer.from(pages[name]));
  }
  const file = path.join(OUT, `corner-bean-${version}.zip`);
  zip.writeZip(file);
  return file;
}

const png = await logo();
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "assets", "logo.png"), png);

/* assets are added to both archives explicitly so the image check has a file */
for (const [version, passes] of [["v1", false], ["v2", true]]) {
  const file = path.join(OUT, `corner-bean-${version}.zip`);
  build(version, passes);
  const zip = new AdmZip(file);
  zip.addFile("assets/logo.png", png);
  zip.writeZip(file);
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`${path.basename(file)}  ${kb} kB  ${zip.getEntries().length} entries`);
}
