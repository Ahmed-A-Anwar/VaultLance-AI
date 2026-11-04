import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://127.0.0.1:5173";
const NOW = Date.now();
const DAY = 86400000;
const OUT = "docs/dashboard/polish";
fs.mkdirSync(OUT, { recursive: true });

const base = {
  clientName: "Ahmed",
  clientEmail: "ahmed@northlight.co",
  amountCents: 12000,
  kind: "design",
  filesCount: 2,
  files: [{ name: "icons.zip", sizeBytes: 491520 }, { name: "preview.pdf", sizeBytes: 122880 }],
  createdAt: NOW - 9 * DAY,
  lastEventAt: NOW - 26 * 3600000,
};

const PHASES = [
  ["draft", "Draft", { uiStatus: "awaiting_payment" }],
  ["invited", "Invited", { uiStatus: "awaiting_payment", invitedAt: NOW - 4 * DAY }],
  ["funded", "Funded", { uiStatus: "held", invitedAt: NOW - 4 * DAY }],
  ["submitted", "Submitted", { uiStatus: "held", invitedAt: NOW - 6 * DAY, submittedAt: NOW - 2 * DAY }],
  ["in_review", "In Review", { uiStatus: "audited", invitedAt: NOW - 6 * DAY, submittedAt: NOW - 2 * DAY }],
  ["paid_pending", "Paid Pending", { uiStatus: "unlocked", submittedAt: NOW - 2 * DAY, payoutStatus: "pending" }],
  ["paid", "Paid", { uiStatus: "unlocked", submittedAt: NOW - 2 * DAY, payoutStatus: "paid", payoutPaypalId: "8XK98273645AB12Z" }],
  ["payout_failed", "Payout Failed", { uiStatus: "unlocked", submittedAt: NOW - 6 * DAY, payoutStatus: "failed", payoutPaypalId: "8XK12345AB678901C" }],
  ["voided", "Voided", { uiStatus: "voided", invitedAt: NOW - 5 * DAY, submittedAt: NOW - 3 * DAY }],
];

const vaults = PHASES.map(([, project, extra], i) => ({
  ...base,
  ...extra,
  id: `v_p${i}`,
  project,
  amountCents: 12000 + i * 3000,
}));

const session = { email: "freelancer@vaultlance.ai", role: "freelancer", since: NOW };

async function boot(ctx, store) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
  await p.evaluate(
    ([s, st]) => {
      const js = JSON.stringify(s);
      localStorage.setItem("vl.dash.session", js);
      sessionStorage.setItem("vl.dash.session", js);
      if (st) sessionStorage.setItem("vl.fd.store", JSON.stringify(st));
      else sessionStorage.removeItem("vl.fd.store");
    },
    [session, store],
  );
  await p.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2600);
  return p;
}

const report = { geometry: [], nan: {}, loads: {}, ledger: {} };
const browser = await chromium.launch();

/* ---------- A: nine phases at four viewports ---------- */
const VIEWPORTS = [
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [390, 844],
];

for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await boot(ctx, { vaults, events: [] });
  await p.screenshot({ path: `${OUT}/${w}x${h}-all-phases.png`, fullPage: true });

  const cards = p.locator(".fd-card");
  const n = await cards.count();
  for (let i = 0; i < n; i += 1) {
    const card = cards.nth(i);
    const project = (await card.locator(".fd-card-project").innerText()).trim();
    const slug = project.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const m = await card.evaluate((el) => {
      const cr = el.getBoundingClientRect();
      const left = el.querySelector(".fd-card-left");
      const hint = el.querySelector(".fd-card-hint");
      const info = el.querySelector(".fd-info");
      const steps = el.querySelector(".fd-steps");
      const btns = [...el.querySelectorAll(".fd-card-actions button")];
      const hr = hint.getBoundingClientRect();
      const ir = info.getBoundingClientRect();
      const overlap = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      return {
        cardW: Math.round(cr.width),
        cardH: Math.round(cr.height),
        leftClipped: left.scrollHeight > left.clientHeight + 1,
        leftNeed: left.scrollHeight,
        leftHave: left.clientHeight,
        hintLines: Math.round(hr.height / parseFloat(getComputedStyle(hint).lineHeight)),
        hintTitle: hint.getAttribute("title") === hint.textContent.trim(),
        hintAria: hint.getAttribute("aria-label") === hint.textContent.trim(),
        hintTextRight: Math.round(hr.right - parseFloat(getComputedStyle(hint).paddingRight)),
        infoLeft: Math.round(ir.left),
        infoBox: [Math.round(ir.width), Math.round(ir.height)],
        infoOverlapsHintBox: overlap(hr, ir),
        stepRows: new Set([...el.querySelectorAll(".fd-step")].map((s) => Math.round(s.getBoundingClientRect().top))).size,
        stepH: Math.round(steps.getBoundingClientRect().height),
        labelsVisible: [...el.querySelectorAll(".fd-step-label")].filter((s) => s.getBoundingClientRect().width > 2).length,
        buttons: btns.map((b) => ({
          h: Math.round(b.getBoundingClientRect().height),
          text: b.textContent.trim(),
          gapToBottom: Math.round(cr.bottom - b.getBoundingClientRect().bottom),
        })),
        buttonRows: new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top))).size,
        buttonsOverlapHint: btns.some((b) => overlap(b.getBoundingClientRect(), hr)),
        buttonsOverlapInfo: btns.some((b) => overlap(b.getBoundingClientRect(), ir)),
        hintToInfo: Math.round(ir.left - (hr.right - parseFloat(getComputedStyle(hint).paddingRight))),
      };
    });
    await card.screenshot({ path: `${OUT}/${w}x${h}-phase-${slug}.png` });
    report.geometry.push({ viewport: `${w}x${h}`, phase: slug, ...m });
  }

  /* ---------- B: NaN + ledger scroll on the richest page ---------- */
  report.nan[`${w}x${h}`] = await p.evaluate(() => {
    const t = document.body.innerText;
    const bad = ["NaN", "undefined", "Invalid Date", "Infinity"].filter((x) => t.includes(x));
    return bad;
  });
  report.ledger[`${w}x${h}`] = await p.evaluate(() => {
    const g = document.querySelector(".fd-grid .ag-root-wrapper");
    const led = document.querySelector(".fd-ledger");
    return {
      hScroll: g ? g.scrollWidth - g.clientWidth : null,
      ledgerH: led ? Math.round(led.getBoundingClientRect().height) : null,
      cap: Math.round(0.618 * innerHeight),
      docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await ctx.close();
  console.log("done", w, h);
}

/* ---------- C: twenty consecutive loads, no error banner ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let banners = 0;
  for (let i = 0; i < 20; i += 1) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
    await p.evaluate((s) => {
      const js = JSON.stringify(s);
      localStorage.setItem("vl.dash.session", js);
      sessionStorage.setItem("vl.dash.session", js);
      sessionStorage.removeItem("vl.fd.store");
    }, session);
    await p.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".fd-card", { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(1400);
    if (await p.locator(".fd-error-bar").count()) banners += 1;
    await p.close();
  }
  report.loads = { runs: 20, withErrorBanner: banners };
  await ctx.close();
  console.log("20 loads:", banners, "banners");
}

/* ---------- D: keyboard + reduced motion ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await boot(ctx, null);
  await p.locator(".fd-info").first().focus();
  const focusRing = await p.evaluate(() => {
    const el = document.querySelector(".fd-info");
    el.focus();
    const cs = getComputedStyle(el);
    return { outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, box: [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)] };
  });
  await p.keyboard.press("Enter");
  await p.waitForTimeout(600);
  const drawer = await p.evaluate(() => {
    const d = document.querySelector(".fd-drawer");
    return d ? { open: true, focusInside: d.contains(document.activeElement) } : { open: false };
  });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  const closed = await p.evaluate(() => ({
    open: !!document.querySelector(".fd-drawer"),
    focusBack: (document.activeElement?.getAttribute("class") || "").includes("fd-info"),
  }));
  report.keyboard = { focusRing, drawer, closed };
  await ctx.close();

  const rc = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const rp = await boot(rc, null);
  report.reducedMotion = await rp.evaluate(() => ({
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    running: document.getAnimations().filter((a) => a.playState === "running").length,
    cardTransition: getComputedStyle(document.querySelector(".fd-card")).transitionDuration,
  }));
  await rc.close();
  console.log("kb", JSON.stringify(report.keyboard), "rm", JSON.stringify(report.reducedMotion));
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log("wrote", `${OUT}/report.json`);
