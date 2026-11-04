import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://127.0.0.1:5173";
const NOW = Date.now();
const DAY = 86400000;
const HOUR = 3600000;

const SESSION = { email: "freelancer@vaultlance.ai", role: "freelancer", since: NOW };

const f = (name, kb) => ({ name, sizeBytes: Math.round(kb * 1024) });
const base = {
  clientName: "Ahmed",
  clientEmail: "ahmed@northlight.co",
  amountCents: 12000,
  kind: "design",
  filesCount: 2,
  files: [f("icons.zip", 480), f("icons-preview.pdf", 120)],
  createdAt: NOW - 9 * DAY,
  lastEventAt: NOW - 26 * HOUR,
};

const PHASES = [
  ["draft", { uiStatus: "awaiting_payment" }],
  ["invited", { uiStatus: "awaiting_payment", invitedAt: NOW - 4 * DAY }],
  ["funded", { uiStatus: "held", invitedAt: NOW - 4 * DAY }],
  ["submitted", { uiStatus: "held", invitedAt: NOW - 6 * DAY, submittedAt: NOW - 2 * DAY }],
  ["in_review", { uiStatus: "audited", invitedAt: NOW - 6 * DAY, submittedAt: NOW - 2 * DAY }],
  ["paid_pending", { uiStatus: "unlocked", invitedAt: NOW - 6 * DAY, submittedAt: NOW - 2 * DAY, payoutStatus: "pending" }],
  ["paid", { uiStatus: "unlocked", invitedAt: NOW - 6 * DAY, submittedAt: NOW - 2 * DAY, payoutStatus: "paid", payoutPaypalId: "8XK98273645AB12Z" }],
  ["payout_failed", { uiStatus: "unlocked", invitedAt: NOW - 9 * DAY, submittedAt: NOW - 6 * DAY, payoutStatus: "failed", payoutPaypalId: "8XK12345AB678901C" }],
  ["voided", { uiStatus: "voided", invitedAt: NOW - 5 * DAY, submittedAt: NOW - 3 * DAY }],
];

const phaseVaults = PHASES.map(([name, extra], i) => ({
  ...base,
  ...extra,
  id: `v_p${i}`,
  project: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  amountCents: 12000 + i * 3000,
}));

const pretty = (name) => name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function shot(ctx, store, file, opts = {}) {
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
    [SESSION, store],
  );
  await p.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  if (opts.drawer) {
    await p.getByRole("button", { name: /New vault/i }).first().click();
    await p.waitForTimeout(700);
  }
  if (opts.settle) await p.waitForTimeout(opts.settle);
  await p.screenshot({ path: file, fullPage: false });
  const info = await p.evaluate(() => ({
    err: !!document.querySelector(".fd-errorbar"),
    cards: document.querySelectorAll(".fd-card").length,
    text: document.body.innerText,
  }));
  await p.close();
  return info;
}

const results = {};

/* ---- A: five viewports x three states ---------------------------------- */
const VIEWPORTS = [
  [390, 844],
  [1024, 768],
  [1280, 720],
  [1440, 900],
  [1920, 1080],
];

const browser = await chromium.launch();

for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const tag = `${w}`;
  let populated = await shot(ctx, null, `.shots/verify/${tag}-populated.png`, { settle: 2400 });
  for (let i = 0; i < 5 && populated.err; i += 1) {
    populated = await shot(ctx, null, `.shots/verify/${tag}-populated.png`, { settle: 2400 });
  }
  const empty = await shot(ctx, { vaults: [], events: [] }, `.shots/verify/${tag}-empty.png`, { settle: 1800 });
  const drawer = await shot(ctx, null, `.shots/verify/${tag}-drawer1.png`, { drawer: true, settle: 500 });
  results[tag] = {
    populatedCards: populated.cards,
    populatedErrorBar: populated.err,
    emptyCards: empty.cards,
    drawerCards: drawer.cards,
    overflowX: await (async () => {
      const p = await ctx.newPage();
      await p.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
      await p.evaluate((s) => {
        const js = JSON.stringify(s);
        localStorage.setItem("vl.dash.session", js);
        sessionStorage.setItem("vl.dash.session", js);
      }, SESSION);
      await p.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(2200);
      const n = await p.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      await p.close();
      return n;
    })(),
  };
  await ctx.close();
  console.log("viewport", tag, JSON.stringify(results[tag]));
}

/* ---- B: nine phase cards ----------------------------------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
  await p.evaluate(
    ([s, st]) => {
      const js = JSON.stringify(s);
      localStorage.setItem("vl.dash.session", js);
      sessionStorage.setItem("vl.dash.session", js);
      sessionStorage.setItem("vl.fd.store", JSON.stringify(st));
    },
    [SESSION, { vaults: phaseVaults, events: [] }],
  );
  await p.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2600);

  const cards = p.locator(".fd-card");
  const n = await cards.count();
  const seen = [];
  for (let i = 0; i < n; i += 1) {
    const card = cards.nth(i);
    const project = (await card.locator(".fd-card-project").innerText()).trim();
    const slug = project.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const state = await card.evaluate((el) => ({
      chip: el.querySelector(".fd-chip")?.textContent?.trim() ?? null,
      nodes: [...el.querySelectorAll(".fd-step-node")].map((s) => s.className.match(/is-(\w+)/)?.[1] ?? "todo"),
      labels: [...el.querySelectorAll(".fd-step-label")].map((s) => s.textContent.trim()),
      buttons: [...el.querySelectorAll(".fd-card-actions button")].map((b) => b.textContent.trim()),
    }));
    await card.screenshot({ path: `docs/dashboard/phase-${slug}.png` });
    seen.push({ project, slug, ...state });
  }
  results.phaseCards = seen;

  /* NaN / undefined / Invalid Date sweep on this richest page */
  results.nanSweep = await p.evaluate(() => {
    const t = document.body.innerText;
    const bad = ["NaN", "undefined", "Invalid Date", "null", "Infinity"].filter((s) => t.includes(s));
    const hits = [];
    for (const s of bad) {
      const i = t.indexOf(s);
      hits.push({ needle: s, around: t.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, " ") });
    }
    /* and the DOM attributes/aria a user hears */
    const aria = [...document.querySelectorAll("[aria-label]")]
      .map((el) => el.getAttribute("aria-label"))
      .filter((v) => /NaN|undefined|null/.test(v || ""));
    return { hits, aria };
  });
  console.log("phaseCards", n, "nan", JSON.stringify(results.nanSweep));
  await ctx.close();
}

/* ---- C: reduced motion -------------------------------------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => {
    const js = JSON.stringify(s);
    localStorage.setItem("vl.dash.session", js);
    sessionStorage.setItem("vl.dash.session", js);
  }, SESSION);
  await p.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2600);
  results.reducedMotion = await p.evaluate(() => {
    const pick = [".fd-card", ".dash-btn", ".fd-info", ".fd-chip", ".dash-chip-filter"];
    const out = {};
    for (const sel of pick) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      out[sel] = {
        transition: cs.transitionDuration,
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
      };
    }
    out.runningAnimations = document.getAnimations().filter((a) => a.playState === "running").length;
    out.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    return out;
  });
  await p.screenshot({ path: ".shots/verify/1440-reduced-motion.png" });
  console.log("reducedMotion", JSON.stringify(results.reducedMotion));
  await ctx.close();
}

/* ---- D: keyboard -------------------------------------------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => {
    const js = JSON.stringify(s);
    localStorage.setItem("vl.dash.session", js);
    sessionStorage.setItem("vl.dash.session", js);
  }, SESSION);
  await p.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.body.focus());

  const stops = [];
  for (let i = 0; i < 45; i += 1) {
    await p.keyboard.press("Tab");
    stops.push(
      await p.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().slice(0, 40),
          label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 34),
          ring: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? cs.outlineColor : null,
          shadow: cs.boxShadow !== "none",
          visible: r.width > 0 && r.height > 0,
        };
      }),
    );
  }
  const real = stops.filter(Boolean);
  results.keyboard = {
    stops: real.length,
    invisible: real.filter((s) => !s.visible).length,
    unreachableChips: !real.some((s) => s.cls.includes("dash-chip-filter")),
    unreachableInfo: !real.some((s) => s.cls.includes("fd-info")),
    sample: real.slice(0, 8),
  };

  /* Enter on the first card's wheel: opens the details drawer, focus inside */
  await p.locator(".fd-info").first().focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(700);
  results.keyboard.opened = await p.evaluate(() => {
    const dlg = document.querySelector(".fd-drawer");
    if (!dlg) return { open: false };
    return {
      open: true,
      focusInside: dlg.contains(document.activeElement),
      focused: (document.activeElement?.getAttribute("class") || document.activeElement?.tagName || "").slice(0, 40),
      labelledby: dlg.getAttribute("aria-labelledby"),
      modal: dlg.getAttribute("aria-modal"),
    };
  });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(500);
  results.keyboard.afterEscape = await p.evaluate(() => ({
    open: !!document.querySelector(".fd-drawer"),
    focusReturned: (document.activeElement?.getAttribute("class") || "").includes("fd-info"),
    active: (document.activeElement?.getAttribute("class") || document.activeElement?.tagName || "").slice(0, 40),
  }));
  console.log("keyboard", JSON.stringify(results.keyboard));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(".shots/verify/report.json", JSON.stringify(results, null, 2));
console.log("REPORT .shots/verify/report.json");
