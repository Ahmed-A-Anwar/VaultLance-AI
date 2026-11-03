/* slice1-shots.mjs — captures the CLIENT dashboard so the shell change can be
   proved pixel-identical. Run with the dev server up:

     node tests/slice1-shots.mjs before   (or: after)

   Images land in .shots/<phase>/. The session is seeded directly, so the run
   never depends on the sign-in form or on demo-mode timing. */

import { chromium } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const phase = process.argv[2] === "after" ? "after" : "before";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173";
/* process.cwd(), not import.meta.url: the project path has a space in it and a
   file URL would percent-encode it into a different folder. */
const OUT = path.join(process.cwd(), ".shots", phase);

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

/* deterministic client session: the shell only needs email + role */
const SESSION = {
  email: "ahmed@example.com",
  role: "client",
  since: 1_767_225_600_000,
  name: "Ahmed",
};

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await context.addInitScript((session) => {
    try {
      window.localStorage.setItem("vl.dash.session", JSON.stringify(session));
      window.sessionStorage.setItem("vl.dash.session", JSON.stringify(session));
    } catch {
      /* storage unavailable */
    }
  }, SESSION);

  const page = await context.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  /* let the entrance settle and the count-up finish, then freeze what is left */
  await page.waitForTimeout(2600);
  await page.addStyleTag({ content: "*{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `client-${vp.name}.png`) });
  console.log(`captured ${phase}/${vp.name}`);
  await context.close();
}

await browser.close();
