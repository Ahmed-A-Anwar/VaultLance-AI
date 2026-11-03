/* fd-verify.mjs — the measurements and flows the brief asks me to report.
   Prints PASS/FAIL/MEASURE lines; writes screenshots under .shots/verify/. */

import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://127.0.0.1:5173";
const OUT = ".shots/verify";
fs.mkdirSync(OUT, { recursive: true });

const lines = [];
/* printed as they happen, so one brittle step cannot swallow the rest */
const say = (s) => {
  lines.push(s);
  console.log(s);
};
const pass = (k, v = "") => say(`PASS    ${k}${v ? ` — ${v}` : ""}`);
const fail = (k, v = "") => say(`FAIL    ${k}${v ? ` — ${v}` : ""}`);
const measure = (k, v) => say(`MEASURE ${k} = ${v}`);
const check = (k, cond, v = "") => (cond ? pass(k, v) : fail(k, v));

const SESSION = { email: "freelancer@vaultlance.ai", role: "freelancer", since: Date.now(), name: "Maya" };

async function page(browser, w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => {
    if (m.type() === "error" && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await p.addInitScript(
    ([s, store, paypal]) => {
      window.localStorage.setItem("vl.dash.session", JSON.stringify(s));
      window.sessionStorage.setItem("vl.dash.session", JSON.stringify(s));
      if (store !== null) window.sessionStorage.setItem("vl.fd.store", store);
      if (paypal !== null) window.localStorage.setItem("vl.fd.paypalEmail", paypal);
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    },
    [SESSION, opts.store ?? null, opts.paypal ?? null]
  );
  return { p, ctx, errors };
}

const settle = async (p) => {
  for (let i = 0; i < 3; i++) {
    try {
      await p.waitForSelector(".fd-card", { timeout: 12000 });
      return;
    } catch {
      await p.reload({ waitUntil: "domcontentloaded" });
    }
  }
  /* three simulated read failures in a row is a real problem, not the 5% */
  {
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForSelector(".fd-card", { timeout: 12000 });
  }
};

const browser = await chromium.launch();

/* ---------------------------------------------------------- measurements --- */

const { p: m } = await page(browser, 1440, 900, { paypal: "" });
await m.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
await settle(m);

const geom = await m.evaluate(() => {
  const h = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return Math.round(el.getBoundingClientRect().height * 10) / 10;
  };
  const w = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return Math.round(el.getBoundingClientRect().width * 10) / 10;
  };
  const rail = document.querySelector(".dash-rail, .rail, aside[class*='rail']");
  const lower = document.querySelector(".fd-lower");
  const cols = lower ? getComputedStyle(lower).gridTemplateColumns : "";
  return {
    upper: h(".fd-upper"),
    kpi: h(".fd-kpi"),
    card: h(".fd-card"),
    banner: h(".fd-banner"),
    lowerCols: cols,
    railW: rail ? Math.round(rail.getBoundingClientRect().width) : null,
    railClass: rail ? rail.className : null,
    docW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    cls: Math.round((window.__cls || 0) * 1000) / 1000,
    dropH: null,
  };
});

measure("upper band height", geom.upper);
measure("KPI height", geom.kpi);
measure("vault card height", geom.card);
measure("banner height", geom.banner);
measure("lower grid columns", geom.lowerCols);
measure("rail width (collapsed)", geom.railW);
measure("rail class", geom.railClass);
measure("CLS at 1440", geom.cls);

/* drawer geometry */
await m.getByRole("button", { name: "New vault" }).last().click();
await m.waitForSelector(".fd-drawer");
const dw = await m.evaluate(() => {
  const d = document.querySelector(".fd-drawer");
  return d ? Math.round(d.getBoundingClientRect().width * 10) / 10 : null;
});
measure("drawer width", dw);
await m.getByLabel("PROJECT NAME").fill("Geometry Run");
await m.getByLabel("CLIENT EMAIL").fill("client@example.com");
await m.getByLabel("AMOUNT (USD)").fill("180");
const inputH = await m.evaluate(() => {
  const i = document.querySelector(".fd-drawer .fd-input");
  return i ? Math.round(i.getBoundingClientRect().height) : null;
});
measure("drawer input height", inputH);
await m.getByRole("button", { name: "Next", exact: true }).click();
await m.waitForTimeout(250);
const dz = await m.evaluate(() => {
  const d = document.querySelector(".fd-drop");
  const i = document.querySelector(".fd-drawer .fd-input");
  return {
    drop: d ? Math.round(d.getBoundingClientRect().height) : null,
    input: i ? Math.round(i.getBoundingClientRect().height) : null,
    footBtn: (() => {
      const b = document.querySelector(".fd-drawer-foot .fd-btn");
      return b ? Math.round(b.getBoundingClientRect().height) : null;
    })(),
  };
});
measure("dropzone height", dz.drop);
measure("drawer footer button height", dz.footBtn);
await m.screenshot({ path: `${OUT}/1440-drawer2-idle.png` });
await m.keyboard.press("Escape");

const cardBtn = await m.evaluate(() => {
  const b = document.querySelector(".fd-card .fd-btn");
  return b ? Math.round(b.getBoundingClientRect().height) : null;
});
measure("card button height", cardBtn);
await m.screenshot({ path: `${OUT}/1440-populated-banner.png` });
await m.context().close();

/* -------------------------------------------------------- overflow & CLS --- */

const { p: sm } = await page(browser, 390, 844);
await sm.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
await settle(sm);
const small = await sm.evaluate(() => ({
  docW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
  cls: Math.round((window.__cls || 0) * 1000) / 1000,
}));
check("no overflow-x at 390", small.docW <= small.innerW + 1, `doc ${small.docW} / viewport ${small.innerW}`);
measure("CLS at 390", small.cls);
await sm.screenshot({ path: `${OUT}/390-populated.png`, fullPage: true });
await sm.context().close();

/* --------------------------------------------------------- reduced motion --- */

const { p: rm } = await page(browser, 1440, 900, { reduced: true });
await rm.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
await settle(rm);
const motion = await rm.evaluate(() => {
  const s = getComputedStyle(document.querySelector(".fd-card"));
  const sheet = document.querySelector(".fd-drawer");
  return { cardAnim: s.animationDuration, cardTrans: s.transitionDuration, drawer: !!sheet };
});
check("reduced motion suppresses card animation", motion.cardAnim.split(",").every((d) => parseFloat(d) === 0), motion.cardAnim);
check("reduced motion suppresses card transition", motion.cardTrans.split(",").every((d) => parseFloat(d) === 0), motion.cardTrans);
await rm.context().close();

/* ------------------------------------------------------------------ flows --- */

const { p: f } = await page(browser, 1440, 900);
await f.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
await settle(f);

/* 7. retry payout */
const iconCard = f.locator(".fd-card", { hasText: "Icon Set" });
await iconCard.getByRole("button", { name: "Retry payout" }).click();
await f.waitForTimeout(1400);
check("flow 7 retry payout turns failed into PAID", (await iconCard.locator(".fd-chip").textContent())?.includes("PAID"), await iconCard.locator(".fd-chip").textContent());

/* 8. remind cooldown */
const landing = f.locator(".fd-card", { hasText: "Landing Page" });
const remindBtn = landing.getByRole("button", { name: /Remind client|REMIND IN/ });
await remindBtn.click();
await f.waitForTimeout(1400);
const remindLabel = (await remindBtn.textContent())?.trim();
const remindDisabled = await remindBtn.isDisabled();
check("flow 8 remind shows cooldown and blocks", /REMIND IN/.test(remindLabel ?? "") && remindDisabled, `${remindLabel} disabled=${remindDisabled}`);

/* 9. delete draft two step */
const pitch = f.locator(".fd-card", { hasText: "Pitch Deck" });
await pitch.getByRole("button", { name: "Delete draft" }).click();
const confirmSeen = (await pitch.getByRole("button", { name: "Confirm delete" }).count()) === 1;
check("flow 9 first click only asks to confirm", confirmSeen, confirmSeen ? "Confirm delete" : "no confirm label");
await f.waitForTimeout(3400);
check("flow 9 confirm expires after 3s", (await pitch.getByRole("button", { name: "Delete draft" }).count()) === 1);
await pitch.getByRole("button", { name: "Delete draft" }).click();
await pitch.getByRole("button", { name: "Confirm delete" }).click();
await f.waitForTimeout(1200);
check("flow 9 second click deletes the draft", (await f.locator(".fd-card", { hasText: "Pitch Deck" }).count()) === 0);

/* 10. banner + link */
const { p: b } = await page(browser, 1440, 900, { paypal: "" });
await b.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
await settle(b);
const bannerVisible = await b.locator(".fd-banner").isVisible();
const href = await b.locator(".fd-banner a").getAttribute("href");
check("flow 10 banner shows without a PayPal email", bannerVisible, String(bannerVisible));
check("flow 10 Add email targets settings#profile", href === "/dashboard/settings#profile", href ?? "none");
await b.screenshot({ path: `${OUT}/1440-banner.png` });
await b.context().close();

/* ------------------------------------------------------- keyboard journey --- */

const tabUntil = async (p, re, max = 40) => {
  for (let i = 0; i < max; i++) {
    const label = await p.evaluate(() => {
      const a = document.activeElement;
      if (!a) return "";
      /* a field's name lives on its <label>, not in its textContent */
      const lab = a.closest("label")?.textContent ?? "";
      return `${a.tagName} ${a.textContent ?? ""} ${a.getAttribute("aria-label") ?? ""} ${a.getAttribute("placeholder") ?? ""} ${lab}`;
    });
    if (re.test(label)) return true;
    await p.keyboard.press("Tab");
  }
  return false;
};

const { p: k } = await page(browser, 1440, 900);
await k.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
await settle(k);
await k.evaluate(() => {
  const btn = Array.from(document.querySelectorAll(".fd-panel-head button")).find((b) => /New vault/i.test(b.textContent ?? ""));
  btn?.focus();
});
await k.keyboard.press("Enter");
await k.waitForSelector(".fd-drawer", { timeout: 5000 });
const focusInField = await k.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.closest("label")?.textContent ?? "");
check("keyboard: drawer opens on Enter and lands in a field", /PROJECT NAME/i.test(focusInField), focusInField.slice(0, 40));

await k.keyboard.type("Keyboard Vault");
await tabUntil(k, /CLIENT EMAIL/i);
await k.keyboard.type("client@example.com");
await tabUntil(k, /AMOUNT/i);
await k.keyboard.type("180");
check("keyboard: form reached Next", await tabUntil(k, /BUTTON\s+Next/i));
await k.keyboard.press("Enter");
await k.waitForTimeout(300);
check("keyboard: reached deliverables", await k.getByText("Drop a .zip here or browse").isVisible());

/* staging URL is the keyboard-completable delivery path: ArrowRight on the
   radiogroup switches tabs, which is the ARIA contract */
await tabUntil(k, /UPLOAD ZIP/i);
await k.keyboard.press("ArrowRight");
await k.waitForSelector(".fd-url input", { timeout: 6000 }).catch(() => {});
check("keyboard: arrow keys switch the delivery tab", await k.locator(".fd-url input").isVisible());
await k.locator(".fd-url input").focus();
await k.keyboard.type("https://preview.example.dev");
await tabUntil(k, /Check URL/i);
await k.keyboard.press("Enter");
await k.waitForTimeout(400);
check("keyboard: URL check passes", await k.getByText(/Responded in 412 ms/).isVisible());
check("keyboard: reached Next on deliverables", await tabUntil(k, /BUTTON\s+Next/i));
await k.keyboard.press("Enter");
await k.waitForTimeout(400);
check("keyboard: reached review", await k.getByText("YOU RECEIVE (EST.)").isVisible());
check("keyboard: reached create", await tabUntil(k, /Create & invite client/i));
await k.keyboard.press("Enter");
await k.waitForSelector(".fd-code", { timeout: 15000 }).catch(() => {});
const code = (await k.locator(".fd-code").textContent())?.trim() ?? "";
check("keyboard: success shows a VL code", /^VL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), code);
await k.screenshot({ path: `${OUT}/1440-success.png` });
await k.keyboard.press("Escape");
await k.waitForTimeout(300);
const restored = await k.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
check("keyboard: focus returns to the opener", /New vault/i.test(restored), restored.slice(0, 30));
await k.context().close();

/* ------------------------------------------------------------ screenshot --- */

const states = async (w, h) => {
  const { p, ctx } = await page(browser, w, h);
  await p.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
  await settle(p);
  await p.screenshot({ path: `${OUT}/${w}-populated.png`, fullPage: h < 800 });

  /* empty: an explicitly empty store must survive a reload */
  const empty = await page(browser, w, h, { store: JSON.stringify({ vaults: [], events: [] }) });
  await empty.p.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
  await empty.p.waitForTimeout(1600);
  const emptyText = await empty.p.locator(".fd-empty-title").textContent().catch(() => null);
  if (w === 1440) check("empty state renders", emptyText === "No vaults yet.", emptyText ?? "none");
  await empty.p.screenshot({ path: `${OUT}/${w}-empty.png`, fullPage: h < 800 });
  await empty.ctx.close();

  if (w === 1440) {
    await p.getByRole("button", { name: "New vault" }).last().click();
    await p.waitForSelector(".fd-drawer");
    await p.screenshot({ path: `${OUT}/${w}-drawer1.png` });
    await p.getByLabel("PROJECT NAME").fill("Motion Pack");
    await p.getByLabel("CLIENT EMAIL").fill("client@example.com");
    await p.getByLabel("AMOUNT (USD)").fill("180");
    await p.getByRole("button", { name: "Next", exact: true }).click();
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/${w}-drawer2.png` });

    const input = p.locator(".fd-drawer input[type=file]");
    await input.setInputFiles({ name: "site.zip", mimeType: "application/zip", buffer: Buffer.from("PK\u0003\u0004mock") });
    await p.waitForTimeout(450);
    await p.screenshot({ path: `${OUT}/${w}-drawer2-scanning.png` });
    await p.waitForSelector(".fd-scan-row[data-state='pass']", { timeout: 8000 });
    await p.screenshot({ path: `${OUT}/${w}-drawer2-passed.png` });
    await p.getByRole("button", { name: "Next", exact: true }).click();
    await p.waitForTimeout(350);
    await p.screenshot({ path: `${OUT}/${w}-drawer3.png` });
    await p.getByRole("button", { name: /Create & invite client/i }).click();
    await p.waitForSelector(".fd-code", { timeout: 20000 }).catch(() => {});
    /* the mock fails 5% of calls on purpose: retry the create once */
    if ((await p.locator(".fd-code").count()) === 0) {
      await p.getByRole("button", { name: /Create & invite client/i }).click();
      await p.waitForSelector(".fd-code", { timeout: 20000 }).catch(() => {});
    }
    await p.screenshot({ path: `${OUT}/${w}-success.png` });
    await p.getByRole("button", { name: "Done" }).click();
    await p.waitForSelector(".fd-code", { state: "detached" });
    await p.locator(".fd-info").first().click();
    await p.waitForSelector(".fd-detail");
    await p.screenshot({ path: `${OUT}/${w}-details.png` });
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
  }
  await ctx.close();
};

for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [390, 844]]) {
  try {
    await states(w, h);
    pass(`screens captured at ${w}x${h}`);
  } catch (e) {
    fail(`screens at ${w}x${h}`, String(e).slice(0, 120));
  }
}

/* failed scan, on its own page so it cannot disturb the happy path */
try {
const { p: bad, ctx: badCtx } = await page(browser, 1440, 900);
await bad.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
await settle(bad);
await bad.getByRole("button", { name: "New vault" }).last().click();
await bad.getByLabel("PROJECT NAME").fill("Bad Scan");
await bad.getByLabel("CLIENT EMAIL").fill("client@example.com");
await bad.getByLabel("AMOUNT (USD)").fill("50");
await bad.getByRole("button", { name: "Next", exact: true }).click();
await bad.waitForTimeout(200);
await bad.locator(".fd-drawer input[type=file]").setInputFiles({ name: "bomb.zip", mimeType: "application/zip", buffer: Buffer.from("PK") });
await bad.waitForTimeout(900);
const scanFail = await bad.locator(".fd-inline-error, .fd-scan-row[data-state='fail']").first().isVisible().catch(() => false);
const nextBlocked = await bad.getByRole("button", { name: "Next", exact: true }).isDisabled();
check("flow 3 bomb.zip fails the scan and blocks Next", scanFail && nextBlocked, `error=${scanFail} disabled=${nextBlocked}`);
await bad.screenshot({ path: `${OUT}/1440-drawer2-failed.png` });
await badCtx.close();
} catch (e) {
  fail("flow 3 bomb.zip scan", String(e).slice(0, 120));
}

await browser.close();

/* -------------------------------------------------------------- contrast --- */

const lum = (hex) => {
  const n = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const mix = (a, b, t) => {
  const pa = a.replace("#", ""), pb = b.replace("#", "");
  const ch = (i) => Math.round(parseInt(pa.slice(i, i + 2), 16) * (1 - t) + parseInt(pb.slice(i, i + 2), 16) * t);
  return `#${[0, 2, 4].map((i) => ch(i).toString(16).padStart(2, "0")).join("")}`;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};
const glass = mix("#C9D0D2", "#FFFFFF", 0.35);
const table = [
  ["DRAFT / AWAITING chip", "#4B5663", mix(glass, "#8A95A1", 0.1)],
  ["FUNDED / PAYOUT PENDING chip", "#7A551A", mix(glass, "#B8893A", 0.12)],
  ["SUBMITTED / IN REVIEW chip", "#085A63", mix(glass, "#12A5B5", 0.12)],
  ["PAID chip", "#0B5E3E", mix(glass, "#1F9D6B", 0.12)],
  ["PAYOUT FAILED / VOIDED chip", "#8F2A24", mix(glass, "#C4453D", 0.12)],
  ["card hint text", "#4B5663", glass],
  ["KPI label", "#4B5663", glass],
  ["banner text", "#0E1520", mix(glass, "#B8893A", 0.06)],
  ["primary button", "#F7F8F8", "#0E1520"],
  ["status line (danger)", "#8F2A24", glass],
];
lines.push("CONTRAST (text on its own composited fill)");
for (const [name, fg, bg] of table) {
  const r = ratio(fg, bg);
  lines.push(`  ${r >= 4.5 ? "AA  " : "LOW "} ${name}: ${r}:1  (${fg} on ${bg})`);
}

console.log(lines.join("\n"));
