#!/usr/bin/env node
/* ui-sweep.mjs — the visual QA sweep.
 *
 * Drives the app in its demo mode (?demo=1) with a seeded dashboard session, so
 * every state is browser-side and no real data is created. For each matrix cell
 * and viewport it waits for fonts and animations to settle, screenshots the
 * viewport, and measures the checks in docs/ui-audit/matrix.md.
 *
 * Usage:
 *   node scripts/ui-sweep.mjs                     # full matrix, chromium
 *   node scripts/ui-sweep.mjs --browsers=chromium,webkit
 *   node scripts/ui-sweep.mjs --viewports=390,1440 --routes=/dashboard
 *   node scripts/ui-sweep.mjs --stress            # adds stubbed stress cells
 *
 * Exit code 1 when any P0 or P1 issue is found (CI threshold), unless --report.
 */
import { chromium, firefox, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

const APP = (process.env.UI_APP || "http://127.0.0.1:5173").replace(/\/+$/, "");
const OUT = path.resolve("docs/ui-audit");
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const VIEWPORTS = arg("viewports", "390,768,1024,1280,1440,1920")
  .split(",")
  .map((w) => Number(w.trim()))
  .filter(Boolean)
  .map((width) => ({ width, height: width <= 390 ? 844 : width <= 768 ? 1024 : width <= 1024 ? 768 : width <= 1280 ? 720 : width <= 1440 ? 900 : 1080 }));
const BROWSERS = arg("browsers", "chromium").split(",").map((b) => b.trim()).filter(Boolean);
const ONLY = arg("routes", "");
const REPORT_ONLY = process.argv.includes("--report");
const STRESS = process.argv.includes("--stress");

const ENGINES = { chromium, firefox, webkit };

const seed = (role) =>
  role === "anon"
    ? null
    : { email: role === "freelancer" ? "freelancer@vaultlance.ai" : "client@northfield.co", role, since: 1794000000000 };

/* route, role, state note */
const CELLS = [
  { route: "/", role: "anon", state: "landing" },
  { route: "/signup", role: "anon", state: "signup" },
  { route: "/signup?role=freelancer", role: "anon", state: "signup-freelancer" },
  { route: "/signin", role: "anon", state: "signin" },
  { route: "/forgot-password", role: "anon", state: "forgot" },
  { route: "/reset-password", role: "anon", state: "reset-no-token" },
  { route: "/playground", role: "anon", state: "playground" },
  { route: "/demo", role: "anon", state: "demo" },
  { route: "/vault/new", role: "anon", state: "vault-new" },
  { route: "/console", role: "anon", state: "console" },
  { route: "/terms", role: "anon", state: "404-terms" },
  { route: "/dashboard", role: "client", state: "client-overview" },
  { route: "/dashboard/vaults", role: "client", state: "client-vaults" },
  { route: "/dashboard/ledger", role: "client", state: "client-ledger" },
  { route: "/dashboard/payments", role: "client", state: "client-payments" },
  { route: "/dashboard/settings", role: "client", state: "client-settings" },
  { route: "/dashboard", role: "freelancer", state: "freelancer-overview" },
  { route: "/dashboard/vaults", role: "freelancer", state: "freelancer-vaults" },
  { route: "/dashboard/ledger", role: "freelancer", state: "freelancer-earnings" },
  { route: "/dashboard/payments", role: "freelancer", state: "freelancer-payments" },
  { route: "/dashboard/settings", role: "freelancer", state: "freelancer-settings" },
];

const issues = [];
const cellsRun = [];

const severityOf = (check) =>
  check === "overflow" || check === "stacking" ? "P0" : check === "clipped" || check === "tap" ? "P1" : "P2";

function add({ route, state, viewport, browser, check, element, detail, severity }) {
  issues.push({
    id: `ui-${issues.length + 1}`,
    route,
    state,
    viewport: `${viewport.width}x${viewport.height}`,
    browser,
    check,
    element: element || "",
    detail,
    severity: severity || severityOf(check),
    screenshot: "",
  });
}

async function settle(page) {
  await page
    .evaluate(async () => {
      await Promise.all([
        document.fonts.load('16px "Archivo Variable"'),
        document.fonts.load('16px "IBM Plex Mono"'),
      ]).catch(() => {});
      await document.fonts.ready;
    })
    .catch(() => {});
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 500)));
      })
  );
  /* let finite CSS transitions finish, without waiting on infinite spinners */
  await page.evaluate(async () => {
    const animations = document.getAnimations ? document.getAnimations() : [];
    await Promise.all(
      animations
        .filter((a) => a.effect?.getTiming?.().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {}))
    );
  }).catch(() => {});
}

/* ------------------------------------------------------------- measuring --- */

async function measure(page) {
  return page.evaluate(() => {
    const out = { overflow: 0, clipped: [], tap: [], images: [], fonts: {}, overlap: [], offscreen: [] };
    const doc = document.documentElement;
    out.overflow = doc.scrollWidth - doc.clientWidth;

    const describe = (el) => {
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
    };

    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el);
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (
        ownText &&
        /hidden|clip/.test(s.overflowX + s.overflowY) &&
        !el.hasAttribute("data-ellipsis") &&
        !["HTML", "BODY"].includes(el.tagName) &&
        !el.classList.contains("ag-cell")
      ) {
        /* a couple of pixels of line-height rounding is not clipping */
        if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 4) {
          out.clipped.push({ el: describe(el), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight });
        }
      }
      const r = el.getBoundingClientRect();
      if (r.left < -1 && !el.closest("[style*='scroll'], .marquee, .rail-scroll")) out.offscreen.push({ el: describe(el), left: Math.round(r.left) });
    }

    const interactive = [...document.querySelectorAll("a[href], button, input, select, textarea, [role='button'], [role='tab'], [role='switch']")].filter(visible);
    if (window.innerWidth <= 768) {
      for (const el of interactive) {
        const r = el.getBoundingClientRect();
        if (r.width >= 44 && r.height >= 44) continue;
        /* prose links are exempt from the 44px target rule */
        const inlineLink = el.tagName === "A" && getComputedStyle(el).display.includes("inline") && !!el.closest("p, li, .prose");
        if (inlineLink) continue;
        const primary = el.matches(".dash-cta-primary, .dash-btn-primary, .fd-btn-primary, button[type='submit'], .btn-primary, [data-primary]");
        out.tap.push({
          el: describe(el),
          text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
          primary,
        });
      }
    }
    for (let i = 0; i < interactive.length; i++) {
      const a = interactive[i];
      const ra = a.getBoundingClientRect();
      for (let j = i + 1; j < interactive.length; j++) {
        const b = interactive[j];
        if (a.contains(b) || b.contains(a)) continue;
        const rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        /* only a real collision: both hit-testable and a meaningful share of
           the smaller control, not a glyph box grazing its wrapper */
        const shared = w > 0 && h > 0 ? w * h : 0;
        const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
        const hitA = getComputedStyle(a).pointerEvents !== "none";
        const hitB = getComputedStyle(b).pointerEvents !== "none";
        if (shared > 24 && shared / smaller > 0.25 && hitA && hitB) {
          out.overlap.push({ a: describe(a), b: describe(b), area: Math.round(shared) });
        }
      }
    }

    for (const img of document.querySelectorAll("img")) {
      if (!visible(img)) continue;
      const r = img.getBoundingClientRect();
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const problems = [];
      if (!nw || !nh) problems.push("no-natural-size");
      else {
        const natural = nw / nh;
        const shown = r.width / r.height;
        if (Math.abs(natural - shown) / natural > 0.05) problems.push(`stretched ${natural.toFixed(2)}→${shown.toFixed(2)}`);
        if (r.width > nw * 1.5 && r.width > 320) problems.push(`upscaled ${nw}→${Math.round(r.width)}`);
      }
      if (!img.hasAttribute("alt")) problems.push("missing-alt");
      if (problems.length) out.images.push({ el: describe(img), src: (img.currentSrc || img.src).split("/").pop(), problems });
    }

    for (const family of ["Archivo Variable", "IBM Plex Mono", "Fraunces", "Inter", "JetBrains Mono"]) {
      out.fonts[family] = document.fonts.check(`16px "${family}"`);
    }
    return out;
  });
}

async function stacking(page, { route, state, viewport, browser }) {
  const open = await page.locator("[role='dialog'], .fd-drawer, .toast, .popover, [role='menu']").count();
  if (!open) return;
  const result = await page.evaluate(() => {
    const layer = [...document.querySelectorAll("[role='dialog'], .fd-drawer, .toast, .popover, [role='menu']")].find(
      (el) => el.getBoundingClientRect().width > 80
    );
    if (!layer) return null;
    const r = layer.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { covered: !(hit === layer || layer.contains(hit)), scrollLocked: getComputedStyle(document.body).overflow !== "visible" };
  });
  if (result?.covered) add({ route, state, viewport, browser, check: "stacking", element: "open overlay", detail: "elementFromPoint at its center returns another element" });
  if (result && !result.scrollLocked) add({ route, state, viewport, browser, check: "scroll-lock", element: "open overlay", detail: "body still scrolls behind the overlay", severity: "P2" });
}

async function spacing(page, ctx) {
  const rows = await page.evaluate(() => {
    const pick = (sel) => document.querySelector(sel);
    const read = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { pad: s.padding, gap: s.gap || s.columnGap, radius: s.borderRadius, h: Math.round(r.height) };
    };
    return {
      card: read(pick(".dash-card, .fd-card, .card")),
      railGap: read(pick(".dash-nav")),
      button: read(pick(".btn, .fd-btn, button.dash-primary")),
    };
  });
  /* tokens: radius 13 on cards, primary control height 55 */
  if (rows.card && Math.abs(parseFloat(rows.card.radius) - 13) > 1) {
    add({ ...ctx, check: "spacing", element: "card", detail: `radius ${rows.card.radius} (spec 13)`, severity: "P2" });
  }
  if (rows.button && rows.button.h && Math.abs(rows.button.h - 55) > 1 && Math.abs(rows.button.h - 44) > 1) {
    add({ ...ctx, check: "spacing", element: "primary button", detail: `height ${rows.button.h}px (spec 55 desktop / 44 mobile)`, severity: "P2" });
  }
}

async function axe(page, ctx) {
  try {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    for (const v of result.violations) {
      if (!(v.id === "color-contrast" || v.impact === "serious" || v.impact === "critical")) continue;
      add({
        ...ctx,
        check: v.id === "color-contrast" ? "contrast" : "axe",
        element: v.nodes[0]?.target?.join(" ") || v.id,
        detail: `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help}`,
        severity: v.impact === "critical" ? "P1" : "P2",
      });
    }
  } catch (e) {
    add({ ...ctx, check: "axe", element: "", detail: `axe failed: ${String(e.message).slice(0, 120)}`, severity: "P2" });
  }
}

/* ---------------------------------------------------------------- driving --- */

async function runCell(browser, browserName, viewport, cell) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const session = seed(cell.role);
  await context.addInitScript((s) => {
    window.__cls = 0;
    try {
      if (s) sessionStorage.setItem("vl.dash.session", JSON.stringify(s));
      else sessionStorage.removeItem("vl.dash.session");
    } catch {}
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  }, session);

  /* the dashboard reads the API even in demo mode; answer it locally so no
     server is needed and no real data is touched */
  await context.route("**/api/**", async (route) => {
    const url = route.request().url();
    const ok = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "stub", data }) });
    if (url.includes("/vaults") && route.request().method() === "GET") {
      return ok([
        { id: "11111111-1111-4111-8111-111111111111", title: "Northfield storefront rebuild", amount: 25, status: "AUTHORIZED", createdAt: new Date(Date.now() - 864e5).toISOString(), members: [{ role: "FREELANCER", fullName: "Ada Fielding" }] },
        { id: "22222222-2222-4222-8222-222222222222", title: "Ledger export and reconciliation", amount: 480, status: "PAID", createdAt: new Date(Date.now() - 5 * 864e5).toISOString(), members: [{ role: "FREELANCER", fullName: "Ada Fielding" }] },
      ]);
    }
    if (url.includes("/ledger")) {
      return ok([
        { id: "e1", event_type: "FUNDS_AUTHORIZED", vault_id: "11111111-1111-4111-8111-111111111111", amount: 25, created_at: new Date().toISOString(), metadata: {} },
        { id: "e2", event_type: "PAYMENT_CAPTURED", vault_id: "22222222-2222-4222-8222-222222222222", amount: 480, created_at: new Date(Date.now() - 864e5).toISOString(), metadata: {} },
      ]);
    }
    return ok({});
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${r.url().split("/").pop()} ${r.failure()?.errorText || ""}`.slice(0, 160)));

  const url = `${APP}${cell.route}${cell.route.includes("?") ? "&" : "?"}demo=1`;
  const ctx = { route: cell.route, state: cell.state, viewport, browser: browserName };
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    /* the lazy route's Suspense fallback says "Loading…"; a screenshot of that
       is not a screen. Wait for real content, then for fonts and motion. */
    await page
      .waitForFunction(() => {
        const text = document.body.innerText.trim();
        return text.length > 0 && !/^Loading…?$/.test(text);
      }, { timeout: 20_000 })
      .catch(() => {});
    await page.waitForSelector("h1, main", { timeout: 15_000 }).catch(() => {});
    await settle(page);
    const slug = `${cell.state}-${viewport.width}-${browserName}`;
    const shot = path.join(SHOTS, `${slug}.png`);
    await page.screenshot({ path: shot, fullPage: false });

    const m = await measure(page);
    if (m.overflow > 0) add({ ...ctx, check: "overflow", element: "document", detail: `horizontal overflow ${m.overflow}px` });
    for (const c of m.clipped.slice(0, 4)) add({ ...ctx, check: "clipped", element: c.el, detail: `scroll ${c.sw}x${c.sh} vs client ${c.cw}x${c.ch}` });
    for (const o of m.overlap.slice(0, 4)) add({ ...ctx, check: "overlap", element: `${o.a} ∩ ${o.b}`, detail: `${o.area}px² overlap` });
    for (const t of m.tap.slice(0, 8))
      add({ ...ctx, check: t.primary ? "tap-primary" : "tap", element: t.el, detail: `${t.text} ${t.w}x${t.h}`, severity: t.primary ? "P1" : "P2" });
    for (const im of m.images.slice(0, 4)) add({ ...ctx, check: "image", element: im.el, detail: `${im.src}: ${im.problems.join(", ")}` });
    const missingFonts = Object.entries(m.fonts).filter(([f, ok]) => !ok && ["Archivo Variable", "IBM Plex Mono"].includes(f));
    if (missingFonts.length) add({ ...ctx, check: "fonts", element: missingFonts.map(([f]) => f).join(", "), detail: "declared face not loaded", severity: "P1" });
    const cls = await page.evaluate(() => (window.__cls || 0));
    if (cls > 0.05) add({ ...ctx, check: "cls", element: "document", detail: `CLS ${cls.toFixed(3)}`, severity: "P2" });
    if (consoleErrors.length) add({ ...ctx, check: "console", element: "", detail: consoleErrors[0], severity: "P2" });
    if (failedRequests.length) add({ ...ctx, check: "request", element: failedRequests[0], detail: "failed request", severity: "P2" });

    await stacking(page, ctx);
    await spacing(page, ctx);
    /* axe is the slow check: the two review widths carry it */
    if (!process.argv.includes("--no-axe") && (viewport.width === 390 || viewport.width === 1440)) await axe(page, ctx);
    cellsRun.push({ ...ctx, shot: path.relative(OUT, shot) });
  } catch (e) {
    add({ ...ctx, check: "load", element: url, detail: String(e.message).slice(0, 200), severity: "P1" });
  } finally {
    await context.close().catch(() => {});
  }
}

const selected = CELLS.filter((c) => !ONLY || ONLY.split(",").some((p) => c.route.startsWith(p)));
console.log(`ui-sweep ${selected.length} cells × ${VIEWPORTS.length} viewports × ${BROWSERS.length} browsers`);
for (const browserName of BROWSERS) {
  if (browserName === "firefox") {
    console.log("firefox skipped: browser binary not installed (not approved)");
    continue;
  }
  const browser = await ENGINES[browserName].launch({ headless: true });
  try {
    for (const cell of selected) {
      for (const viewport of VIEWPORTS) {
        if (browserName !== "chromium" && viewport.width !== 390 && viewport.width !== 1440) continue;
        await runCell(browser, browserName, viewport, cell);
      }
      const n = issues.filter((i) => i.route === cell.route).length;
      console.log(`${cell.role.padEnd(10)} ${cell.route.padEnd(24)} issues so far ${n}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

const bySeverity = { P0: 0, P1: 0, P2: 0, P3: 0 };
for (const i of issues) bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
fs.writeFileSync(
  path.join(OUT, "issues.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), app: APP, viewports: VIEWPORTS, browsers: BROWSERS, cells: cellsRun, counts: bySeverity, issues }, null, 2)}\n`
);
console.log(`ISSUES P0 ${bySeverity.P0} · P1 ${bySeverity.P1} · P2 ${bySeverity.P2} · P3 ${bySeverity.P3} · cells ${cellsRun.length}`);
if (!REPORT_ONLY && (bySeverity.P0 || bySeverity.P1)) process.exitCode = 1;
