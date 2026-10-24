/*
  scripts/_derive.mjs — capture screenshots for evidence + report generation.
  Runs against the dev server (http://127.0.0.1:5173).
  Usage: node scripts/_derive.mjs capture all     → docs/screens/<route>-<bp>.png
         node scripts/_derive.mjs report         → summary JSON to stdout
*/
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:5173";
const BPS = [320, 375, 768, 1024, 1440, 1920];
const CLIENT_TOKEN_SEED = "vp_8f3kq2nx4t";       // verify: from SEED; token may differ at runtime

const ROUTES = [
  { route: "learning" },        // landing
  { route: "console" },
  { route: "vault-new", path: "/vault/new" },
];
const RESOLVED = {
  learning: { path: "/" },
  console: { path: "/console" },
  "vault-new": { path: "/vault/new" },
};

async function scrollThrough(page) {
  // per-step double-rAF driver: IO entries flush only on rendering frames
  let last = 0;
  for (let i = 0; i < 20; i++) {
    const y = await page.evaluate(() => {
      const maxY = () => document.documentElement.scrollHeight - window.innerHeight;
      window.__y = (window.__y ?? 0) + 480;
      window.scrollTo(0, Math.min(window.__y, maxY()));
      return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
        void document.body.offsetHeight;
        res(window.scrollY);
      })));
    });
    if (y === last) break;
    last = y;
  }
  await page.waitForTimeout(700); // let transitions finish; reveals latch at data-at=1
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(300);
}

async function shootAll(prefix = "capture") {
  await mkdir("docs/screens", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const warnings = [];
  page.on("console", (m) => { if (m.type() === "error") warnings.push(`console.error: ${m.text()}`); });
  page.on("pageerror", (e) => warnings.push(`pageerror: ${e.message}`));
  const leftward = [];
  for (const { route } of ROUTES) {
    const path = RESOLVED[route].path;
    for (const bp of BPS) {
      await page.setViewportSize({ width: bp, height: 800 });
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      if (path === "/") await scrollThrough(page);
      await page.screenshot({ path: `docs/screens/${route}-${bp}.png`, fullPage: true });
      leftward.push(`docs/screens/${route}-${bp}.png`);
    }
  }
  await browser.close();
  return { files: leftward, warnings };
}

const [cmd, _v] = process.argv.slice(2);
if (cmd === "capture" || cmd === "report") {
  const r = await shootAll(cmd);
  console.log(JSON.stringify(r, null, 2));
} else {
  console.log("usage: node scripts/_derive.mjs <capture|report>");
}
