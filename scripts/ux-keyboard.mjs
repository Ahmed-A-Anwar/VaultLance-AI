#!/usr/bin/env node
/* ux-keyboard.mjs — walks F1–F4 with the keyboard only and records the tab
   order, the focused control, and whether focus is visible. Flags hidden
   focus, unnamed stops, and focus lost to <body> after a navigation. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const APP = (process.env.UX_APP || "http://127.0.0.1:5173").replace(/\/+$/, "");
const OUT = path.resolve("docs/ux-audit");
fs.mkdirSync(path.join(OUT, "evidence"), { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
/* a signed-in session, so the keyboard run starts where the reader would */
await ctx.addInitScript(() => {
  sessionStorage.setItem("vl.dash.session", JSON.stringify({ email: "keyboard@example.com", role: "freelancer", name: "Keyboard", since: Date.now() }));
});
const page = await ctx.newPage();
page.setDefaultTimeout(15_000);
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

const describe = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: "BODY", name: "(focus lost to body)", visible: false };
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const name =
    (el.getAttribute("aria-label") || "").trim() ||
    (el.innerText || el.getAttribute("placeholder") || el.getAttribute("name") || el.getAttribute("type") || "").trim().replace(/\s+/g, " ").slice(0, 60);
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("role") || (el.tagName === "A" ? "link" : el.tagName === "BUTTON" ? "button" : el.tagName === "INPUT" ? "input" : ""),
    name,
    testid: el.getAttribute("data-testid") || "",
    visible: !!(rect.width && rect.height) && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05,
    hiddenAncestor: !!el.closest('[aria-hidden="true"]'),
    outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth || "0") > 0,
  };
});

async function tabRun(label, count = 18) {
  const stops = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    const d = await describe();
    stops.push({ i: i + 1, ...d });
    if (d.testid === "signup-submit" || /new vault/i.test(d.name)) break;
  }
  return { label, stops };
}

const out = { runAt: new Date().toISOString(), pages: {}, flags: [] };
const record = async (key, label, count) => {
  const r = await tabRun(label, count);
  out.pages[key] = r;
  for (const s of r.stops) {
    if (!s.visible) out.flags.push(`${key}: stop ${s.i} is invisible (${s.name})`);
    if (s.hiddenAncestor) out.flags.push(`${key}: stop ${s.i} is inside aria-hidden (${s.name})`);
    if (!s.name || s.name === "(focus lost to body)") out.flags.push(`${key}: stop ${s.i} has no name`);
  }
};

try {
  /* F1 landing */
  await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  await record("F1-landing", "landing", 14);
  out.pages["F1-landing"].title = await page.title();

  /* F2 signup, keyboard: role by Enter, then type, then submit by Enter */
  await page.goto(`${APP}/signup?demo=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  let picked = false;
  for (let i = 0; i < 14 && !picked; i++) {
    await page.keyboard.press("Tab");
    const d = await describe();
    if (d.testid === "role-freelancer") {
      await page.keyboard.press("Enter");
      picked = true;
    }
  }
  out.pages.F2 = { pickedRole: picked, steps: [] };
  await page.waitForTimeout(400);
  const focusAfterRole = await describe();
  out.pages.F2.steps.push(`after role Enter, focus on ${focusAfterRole.testid || focusAfterRole.name}`);
  if (!focusAfterRole.visible) out.flags.push("F2: focus not visible after choosing the role");

  for (const [id, value] of [["signup-name", "Keyboard Only"], ["signup-email", "kb@example.com"], ["signup-password", "Vp-Keyboard-1!"], ["signup-paypal", "kb@example.test"]]) {
    await page.locator(`#${id}`).focus();
    await page.keyboard.type(value);
  }
  await page.locator('[data-testid="signup-submit"]').focus();
  await page.keyboard.press("Enter");
  await page.locator(".signup-done-h, [role=alert]").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(400);
  const afterSignup = await describe();
  out.pages.F2.afterSignup = afterSignup;
  out.pages.F2.doneH1 = await page.locator(".signup-done-h").innerText().catch(() => "");
  if (!/signup-done-h/.test(afterSignup.testid) && afterSignup.tag !== "h2") out.flags.push(`F2: focus after success is ${afterSignup.tag} (${afterSignup.name}), not the success heading`);

  /* F4 dashboard: keyboard to the primary action, open the drawer */
  await page.goto(`${APP}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  out.pages.F4 = { title: await page.title(), steps: [] };
  let opened = false;
  for (let i = 0; i < 20 && !opened; i++) {
    await page.keyboard.press("Tab");
    const d = await describe();
    if (/new vault/i.test(d.name)) {
      await page.keyboard.press("Enter");
      opened = true;
    }
  }
  out.pages.F4.openedDrawer = opened;
  await page.waitForTimeout(500);
  const inDialog = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  const dialogCount = await page.locator('[role="dialog"]').count();
  const focusInDrawer = await describe();
  out.pages.F4.dialogCount = dialogCount;
  out.pages.F4.focusInDrawer = focusInDrawer;
  out.pages.F4.focusInsideDialog = inDialog;
  if (dialogCount && !inDialog) out.flags.push(`F4: drawer opened but focus stayed on ${focusInDrawer.tag} (${focusInDrawer.name})`);

  /* escape should close and return focus */
  if (dialogCount) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const closed = (await page.locator('[role="dialog"]').count()) === 0;
    const back = await describe();
    out.pages.F4.escapeClosed = closed;
    out.pages.F4.focusAfterEscape = back;
    if (!closed) out.flags.push("F4: Escape did not close the drawer");
    if (closed && back.tag === "BODY") out.flags.push("F4: closing the drawer left focus on body");
  }

  /* F3 portal with the keyboard */
  await page.goto(`${APP}/v/cx7-29kd-wq1m`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await record("F3-portal", "portal", 12);
  await page.getByTestId("portal-question").focus();
  await page.keyboard.type("Was the deliverable altered?");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  await page.getByTestId("approve-pay").focus();
  const approveFocus = await describe();
  out.pages.F3 = { approveFocus, tabStopsAfterStream: (await page.evaluate(() => document.querySelectorAll('[role="listitem"] button').length)) };
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/files$/, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  const filesFocus = await describe();
  out.pages.F3.afterApprove = filesFocus;
  out.pages.F3.filesTitle = await page.title();
  if (filesFocus.tag === "BODY") out.flags.push("F3: approving with the keyboard lands on the files page with focus lost to body");
} catch (e) {
  out.error = String(e.message).slice(0, 300);
}

fs.writeFileSync(path.join(OUT, "evidence", "keyboard.json"), `${JSON.stringify(out, null, 2)}\n`);
for (const [k, v] of Object.entries(out.pages)) {
  console.log(`\n== ${k} — title "${v.title || v.filesTitle || ""}"`);
  const stops = v.stops || [];
  for (const s of stops) console.log(` ${String(s.i).padStart(2)} ${s.tag.padEnd(8)} ${s.name.slice(0, 54)} visible=${s.visible} outline=${s.outline}`);
  if (v.steps) console.log(" steps:", v.steps.join(" | "));
  if (v.afterSignup) console.log(" focus after signup:", v.afterSignup.tag, v.afterSignup.testid || v.afterSignup.name);
  if (v.openedDrawer !== undefined) console.log(" drawer:", { opened: v.openedDrawer, dialogs: v.dialogCount, focusInside: v.focusInsideDialog, on: v.focusInDrawer?.name, escapeClosed: v.escapeClosed, afterEscape: v.focusAfterEscape?.name });
  if (v.afterApprove) console.log(" after approve focus:", v.afterApprove.tag, v.afterApprove.name);
}
console.log("\nFLAGS:", out.flags.length ? out.flags : "none");
if (out.error) console.log("ERROR:", out.error);
await browser.close();
