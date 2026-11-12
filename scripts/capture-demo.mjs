#!/usr/bin/env node
/**
 * capture-demo.mjs — the demo recorder.
 *
 * Rules baked in:
 *  - two isolated browser contexts (Omar, Bruce), each recording 1920x1080
 *  - headed, viewport 1920x1080
 *  - a visible cursor with click ripples, injected at capture time only
 *  - email addresses blurred at capture time only (DOM transform, no app edits)
 *  - slow, human typing
 *  - PayPal approval is a human step: the script pauses on stdin and waits for
 *    you to finish the sandbox login; it never retries a bot check
 *  - credentials and tokens are read from env and never printed
 *
 * Usage:
 *   node --env-file=backend/demo.env scripts/capture-demo.mjs --list
 *   node --env-file=backend/demo.env scripts/capture-demo.mjs --shot S01
 *   node --env-file=backend/demo.env scripts/capture-demo.mjs --all
 *
 * Output: demo-assets/clips/raw/<shot>.webm, then (with --convert) H.264 mp4 in
 * demo-assets/handoff/clips/.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const FRONTEND = process.env.DEMO_FRONTEND_URL || process.env.FRONTEND_URL || "https://vault-lance-ai.vercel.app";
const API = process.env.DEMO_API_URL || "https://vaultlance-ai-1.onrender.com/api";
const RAW = path.resolve("demo-assets/clips/raw");
const HANDOFF = path.resolve("demo-assets/handoff/clips");
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(HANDOFF, { recursive: true });

/* credentials: never printed, never logged. demo.env uses two naming styles. */
const creds = {
  omar: {
    email: process.env.DEMO_FREELANCER_EMAIL || process.env.FREELANCER_EMAIL || "",
    password: process.env.DEMO_FREELANCER_PASSWORD || process.env.FREELANCER_PASSWORD || "",
    name: process.env.DEMO_FREELANCER_NAME || "",
  },
  bruce: {
    email: process.env.DEMO_CLIENT_EMAIL || process.env.CLIENT_EMAIL || "",
    password: process.env.DEMO_CLIENT_PASSWORD || process.env.CLIENT_PASSWORD || "",
    name: process.env.DEMO_CLIENT_NAME || "",
  },
};

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const valueOf = (f) => {
  const hit = argv.find((a) => a.startsWith(`--${f}=`));
  if (hit) return hit.slice(f.length + 3);
  const at = argv.indexOf(`--${f}`);
  return at >= 0 ? argv[at + 1] ?? null : null;
};

const SHOTS = [
  { id: "S01", who: "omar", file: "S01_landing", seconds: 10, note: "landing hero + both hovers" },
  { id: "S02", who: "omar", file: "S02_signup", seconds: 45, note: "sign up, empty dashboard" },
  { id: "S03", who: "omar", file: "S03_vault_v1", seconds: 120, note: "new vault, upload v1, invite code" },
  { id: "S04", who: "bruce", file: "S04_join", seconds: 45, note: "sign up, join by code" },
  { id: "S05", who: "bruce", file: "S05_pay", seconds: 180, note: "pay start, PAYPAL HUMAN, authorized" },
  { id: "S06", who: "bruce", file: "S06_audit_fail", seconds: 90, note: "audit room, ask the agent, answer lands" },
  { id: "S07", who: "bruce", file: "S07_revision", seconds: 100, note: "failed check, revision note, requested" },
  { id: "S08", who: "bruce", file: "S08_checks_pass", seconds: 90, note: "re-run, all pass, evidence grid" },
  { id: "S09", who: "bruce", file: "S09_approve", seconds: 120, note: "hold to approve, PAID, unlock, receipt" },
  { id: "S10", who: "omar", file: "S10_earnings", seconds: 90, note: "payout status, earnings, ledger" },
  { id: "S11", who: "bruce", file: "S11_reject", seconds: 15, note: "second vault, reject, voided" },
  { id: "S12", who: "omar", file: "S12_playground", seconds: 20, note: "playground quick run" },
  { id: "S13", who: "bruce", file: "S13_mobile", seconds: 60, note: "390x844 audit + approve" },
  { id: "S14", who: "omar", file: "S14_grids", seconds: 30, note: "ledger + evidence grid close-ups" },
];

/* ── capture-only page dressing: cursor, ripples, email blur, no app edits ── */
const DRESSING = () => {
  const css = document.createElement("style");
  css.textContent = `
    #vl-cursor{position:fixed;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;
      border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 0 0 2px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4);
      pointer-events:none;z-index:2147483647;transition:transform .06s linear;mix-blend-mode:normal}
    #vl-cursor::after{content:"";position:absolute;inset:7px;border-radius:50%;background:#111}
    .vl-ripple{position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
      border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 2px rgba(0,0,0,.35);
      pointer-events:none;z-index:2147483646;animation:vl-r .6s ease-out forwards}
    @keyframes vl-r{from{transform:scale(.6);opacity:.9}to{transform:scale(5);opacity:0}}
    .vl-blur{filter:blur(5px) !important}
  `;
  const mount = () => {
    document.documentElement.appendChild(css);
    const dot = document.createElement("div");
    dot.id = "vl-cursor";
    document.body.appendChild(dot);
    window.addEventListener(
      "mousemove",
      (e) => {
        dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      },
      { passive: true }
    );
    window.addEventListener(
      "mousedown",
      (e) => {
        const r = document.createElement("div");
        r.className = "vl-ripple";
        r.style.left = `${e.clientX}px`;
        r.style.top = `${e.clientY}px`;
        document.body.appendChild(r);
        setTimeout(() => r.remove(), 700);
      },
      { passive: true }
    );

    /* Blur without restructuring anything. The first version wrapped matched
       text nodes in a span, which corrupts React's own child pointers: the next
       keystroke's re-render threw and the drawer unmounted mid-typing. Styling a
       leaf element leaves the tree intact. */
    const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    const mark = (el) => {
      if (!el || el.dataset.vlBlur === "1") return;
      el.dataset.vlBlur = "1";
      el.style.filter = "blur(5px)";
    };
    const scan = () => {
      document.querySelectorAll("body *").forEach((el) => {
        if (el.children.length === 0 && EMAIL.test(el.textContent || "")) mark(el);
      });
      /* by field, not only by value: a half-typed address is not yet a full
         address, and the take showed "bruce." on screen while it was typed */
      document.querySelectorAll('input[type="email"], input[autocomplete*="email"]').forEach(mark);
      document.querySelectorAll("input").forEach((input) => {
        if (EMAIL.test(input.value || "")) mark(input);
      });
    };
    scan();
    new MutationObserver(scan).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.setInterval(scan, 500);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the run's identities, shared across shots ─────────────────────────── */
/* S02 creates Omar and the client address, S03 builds the vault, S04 signs
   Bruce up with that same address and redeems S03's code. Lives in .tmp so it
   never lands in git; contains a generated password, so it is never printed. */
const RUN_FILE = path.resolve(".tmp/demo-run.json");

function loadRun() {
  try {
    return JSON.parse(fs.readFileSync(RUN_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveRun(patch) {
  const next = { ...loadRun(), ...patch };
  fs.mkdirSync(path.dirname(RUN_FILE), { recursive: true });
  fs.writeFileSync(RUN_FILE, JSON.stringify(next, null, 2));
  return next;
}

/* hidden setup only: a bearer token used to read back the vault id and code.
   It is never returned to the page, printed, or written to disk. */
async function apiToken(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  const token = body?.data?.token || body?.token;
  if (!token) throw new Error(`API login failed (${res.status})`);
  return token;
}

/* the signup schema wants 12+ chars with upper, lower, digit and a symbol; a
   random base64url string ticks the first four only when it happens to contain
   "-" or "_", which is why the earlier take sat on a disabled submit */
const generatedPassword = () => `Vl${crypto.randomBytes(9).toString("base64url")}!7Qa`;

/* The dashboard has more than one "New vault" control (the rail item and the
   empty-state button) and the drawer state lives in the shell, so a click that
   lands during a data refresh can be lost. Open it until it is actually there. */
async function openDrawer(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) {
      if ((await page.locator('[role="dialog"] input').count()) >= 3) {
        /* a dialog that is still there after the dashboard's next refresh is the
           one to type into: returning the first mount handed back a node that
           was replaced a moment later, and the form then died mid-typing */
        await sleep(1500);
        const stillOpen =
          (await page.getByRole("dialog").count()) > 0 &&
          (await page.locator('[role="dialog"] input').count()) >= 3;
        if (stillOpen) return page.getByRole("dialog");
      }
    }
    /* not anchored: once a vault exists the empty-state button is gone and the
       only trigger is the header's "+ New vault" */
    await page
      .getByRole("button", { name: /new vault/i })
      .last()
      .click({ timeout: 8000 })
      .catch(() => {});
    await dialog.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    await sleep(1500);
  }
  throw new Error("the New vault drawer would not stay open");
}

async function signInAs(page, who, marks) {
  await page.goto(`${FRONTEND}/signin`, { waitUntil: "domcontentloaded" });
  await page.locator("#signin-email").waitFor({ state: "visible", timeout: 60000 });
  if (marks && !marks.firstFrame) marks.firstFrame = Date.now();
  await sleep(1800);
  await fillHuman(page.locator("#signin-email"), who.email);
  await sleep(500);
  await fillHuman(page.locator("#signin-password"), who.password);
  await sleep(900);
  await page.locator('[data-testid="signin-submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
  await page
    .getByText(/loading dashboard/i)
    .waitFor({ state: "hidden", timeout: 30000 })
    .catch(() => {});
  await sleep(1500);
}

async function apiVaultOrder(vaultId, who) {
  try {
    const token = await apiToken(who.email, who.password);
    const res = await fetch(`${API}/vaults/${vaultId}`, { headers: { authorization: `Bearer ${token}` } });
    const body = await res.json();
    const d = body?.data || {};
    return d.paypalOrderId || d.paypal_order_id || null;
  } catch {
    return null;
  }
}

async function apiVaultStatus(vaultId, who) {
  try {
    const token = await apiToken(who.email, who.password);
    const res = await fetch(`${API}/vaults/${vaultId}`, { headers: { authorization: `Bearer ${token}` } });
    const body = await res.json();
    return body?.data?.status || body?.data?.vault?.status || "unknown";
  } catch {
    return "unknown";
  }
}

/* One attempt at the sandbox buyer login, using the credentials in demo.env.
   Values are never printed. If PayPal shows a bot check we stop immediately and
   leave the rest to the human — a bot check is never retried. */
async function tryPaypalLogin(popup) {
  const email = process.env.PAYPAL_BUYER_EMAIL || process.env.CLIENT_PAYPAL_EMAIL || "";
  const password = process.env.PAYPAL_BUYER_PASSWORD || process.env.CLIENT_PAYPAL_PASSWORD || "";
  if (!email || !password) {
    console.log("PAYPAL_AUTO: no buyer credentials in env, waiting for the human");
    return;
  }
  try {
    const emailBox = popup.locator('input[type="email"], input#email, input[name="login_email"]').first();
    await emailBox.waitFor({ state: "visible", timeout: 45000 });
    await emailBox.fill(email);
    await popup
      .getByRole("button", { name: /next|continue|log ?in/i })
      .first()
      .click({ timeout: 15000 })
      .catch(() => {});
    const pw = popup.locator('input[type="password"], input#password, input[name="login_password"]').first();
    await pw.waitFor({ state: "visible", timeout: 45000 });
    await pw.fill(password);
    await popup
      .getByRole("button", { name: /log ?in|sign ?in|next|continue/i })
      .first()
      .click({ timeout: 15000 })
      .catch(() => {});
    console.log("PAYPAL_AUTO: credentials submitted");
    await sleep(5000);

    const bot = await popup.getByText(/captcha|are you a robot|verify (it's|it is) you/i).count().catch(() => 0);
    if (bot) {
      console.log("PAYPAL_AUTO: bot check on screen — not retrying, the human must finish");
      return;
    }
    const approve = popup.getByRole("button", { name: /agree|continue|approve|pay now/i }).first();
    if (await approve.count().catch(() => 0)) {
      await approve.click({ timeout: 15000 }).catch(() => {});
      console.log("PAYPAL_AUTO: approve clicked");
    }
  } catch (err) {
    console.log(`PAYPAL_AUTO: stopped (${String(err.message).split("\n")[0].slice(0, 80)})`);
  }
}

function listOf(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  return data?.vaults || data?.items || data?.results || [];
}

async function typeSlowly(locator, text, delay = 110) {
  await locator.click();
  await locator.pressSequentially(text, { delay });
}

/* Type, then read the value back. A click that lands while a drawer is still
   animating in can send the keystrokes nowhere, and the take then fails 30s
   later on a disabled button instead of here. */
async function fillHuman(locator, text, delay = 90) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await locator.click();
    await locator.fill("").catch(() => {});
    await locator.pressSequentially(text, { delay });
    const value = await locator.inputValue().catch(() => null);
    if (value === text) return;
  }
  throw new Error("a field would not take the text");
}

function waitForHuman(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n⏸  ${message}\n   (recording continues; press Enter here when the return URL is visible)\n`);
    rl.question("   ready> ", () => {
      rl.close();
      resolve();
    });
  });
}

/* CDP screencast: Playwright's recordVideo is locked at 25 fps, so the hero
   animation loses its real cadence. This asks Chromium for a frame on every
   repaint and muxes them with their own timestamps at 60 fps. Capture only -
   it drives nothing in the page. */
async function startScreencast(page, shot) {
  const dir = path.resolve(".tmp", "screencast", shot.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const client = await page.context().newCDPSession(page);
  const frames = [];

  client.on("Page.screencastFrame", (ev) => {
    const file = path.join(dir, `f-${String(frames.length).padStart(6, "0")}.jpg`);
    frames.push({ file, ts: ev.metadata.timestamp });
    fs.promises.writeFile(file, Buffer.from(ev.data, "base64")).catch(() => {});
    client.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });

  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });

  return {
    dir,
    startedAt: Date.now(),
    async stop() {
      await client.send("Page.stopScreencast").catch(() => {});
      await sleep(600);
      if (frames.length < 10) throw new Error(`screencast produced ${frames.length} frames`);

      const lines = [];
      for (let i = 0; i < frames.length; i += 1) {
        const next = frames[i + 1]?.ts ?? frames[i].ts + 1 / 60;
        const duration = Math.min(0.3, Math.max(1 / 240, next - frames[i].ts));
        lines.push(`file '${frames[i].file.replace(/\\/g, "/")}'`, `duration ${duration.toFixed(4)}`);
      }
      lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, "/")}'`);
      const listFile = path.join(dir, "list.txt");
      fs.writeFileSync(listFile, lines.join("\n"));

      const out = path.join(RAW, `${shot.id}_screencast.mp4`);
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", listFile,
        "-vf", "fps=60,scale=1920:1080:flags=lanczos",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-r", "60",
        out,
      ]);
      return { out, count: frames.length };
    },
  };
}

async function record(shot) {
  /* Recording runs in a headed window that may not hold focus; without these
     Chromium throttles rAF and the vault animation stutters into duplicated
     frames. They are capture-only flags, no page behaviour changes. */
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--window-size=1920,1080",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=CalculateNativeWinOcclusion",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } },
    reducedMotion: "no-preference",
  });
  await context.addInitScript(DRESSING);
  const page = await context.newPage();
  /* the hero logs its own intro decisions under [fx]; without them a skipped
     phase and a slow recorder look identical in the video */
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.startsWith("[fx]")) console.log(`PAGE ${text}`);
  });
  const video = page.video();
  const marks = {};
  const started = Date.now();
  const screencast = has("screencast") ? await startScreencast(page, shot) : null;

  try {
    await handlers[shot.id](page, shot, marks);
  } catch (err) {
    /* a take that dies leaves the frame it died on, so the cause is visible
       instead of guessed at from the selector that timed out */
    await page.screenshot({ path: path.resolve(`.tmp/fail-${shot.id}.png`) }).catch(() => {});
    console.log(`FAILED ${shot.id}: ${err.message.split("\n")[0]} (frame: .tmp/fail-${shot.id}.png)`);
    throw err;
  } finally {
    const mark = marks.firstFrame || marks.heroAt;
    if (mark) console.log(`TRIM_START=${((mark - started) / 1000).toFixed(2)}s (first real frame)`);
    if (screencast) {
      try {
        const { out, count } = await screencast.stop();
        console.log(`screencast ${count} frames -> ${path.basename(out)}`);
        if (mark) console.log(`SCREENCAST_TRIM_START=${((mark - screencast.startedAt) / 1000).toFixed(2)}s`);
      } catch (err) {
        console.log(`screencast failed: ${err.message.split("\n")[0]}`);
      }
    }
    await context.close();
    const popupSrc = await marks.popupVideo?.path().catch(() => null);
    if (popupSrc) {
      const popupTarget = path.join(RAW, `${shot.file}_paypal.webm`);
      fs.copyFileSync(popupSrc, popupTarget);
      console.log(`recorded ${path.basename(popupTarget)} (${(fs.statSync(popupTarget).size / 1e6).toFixed(1)} MB)`);
    }
    const src = await video?.path();
    if (src) {
      const target = path.join(RAW, `${shot.file}.webm`);
      fs.renameSync(src, target);
      console.log(`recorded ${path.basename(target)} (${(fs.statSync(target).size / 1e6).toFixed(1)} MB)`);
      if (has("convert")) {
        const mp4 = path.join(HANDOFF, `${shot.file.replace(/_(.*)$/, "_$1")}.mp4`);
        /* the take opens on the warm-up (frame fetches, then a reload that flashes
           the page white). TRIM_START is where the page first paints for real, so
           the shipped clip starts there; -ss after -i keeps the seek frame-exact. */
        const trim = mark ? Math.max(0, (mark - started) / 1000) : 0;
        execFileSync("ffmpeg", [
          "-y", "-i", target,
          ...(trim > 0 ? ["-ss", trim.toFixed(2)] : []),
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-r", "30",
          "-movflags", "+faststart", mp4,
        ], { stdio: "inherit" });
        console.log(`converted ${path.basename(mp4)} (trimmed ${trim.toFixed(2)}s)`);
      }
    }
    await browser.close();
  }
}

/* The PayPal SDK mounts a detect iframe and a buttons iframe, so the first
   iframe in the stage is not the button. Scan the page's frames for a paypal
   one that actually has a control, and fall back to clicking the iframe box. */
async function clickPaypalButton(page) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      let url = "";
      try {
        url = frame.url();
      } catch {
        continue;
      }
      if (!/paypal/i.test(url)) continue;
      const candidates = frame.locator('[role="button"], button, a[href], [data-funding-source]');
      const count = await candidates.count().catch(() => 0);
      for (let i = 0; i < count && i < 4; i += 1) {
        const target = candidates.nth(i);
        if (await target.isVisible().catch(() => false)) {
          await target.click({ timeout: 15000 }).catch(() => {});
          if (page.context().pages().length > 1) return true;
          /* no popup yet: the SDK may be navigating, so give it a beat */
          await sleep(2500);
          return true;
        }
      }
    }
    await sleep(1500);
  }

  /* last resort: click the buttons iframe's own box */
  const box = page.locator(".paypal-btn-stage:visible iframe").last();
  if (await box.isVisible().catch(() => false)) {
    await box.click({ position: { x: 40, y: 20 }, timeout: 15000 }).catch(() => {});
    return true;
  }
  return false;
}

/* Sandbox buyer login on PayPal's own page. Values come from demo.env and are
   never printed. One pass only: if PayPal shows a bot check we stop there. */
async function paypalBuyerLogin(page) {
  const email = process.env.PAYPAL_BUYER_EMAIL || process.env.CLIENT_PAYPAL_EMAIL || "";
  const password = process.env.PAYPAL_BUYER_PASSWORD || process.env.CLIENT_PAYPAL_PASSWORD || "";
  if (!email || !password) {
    console.log("PAYPAL_AUTO: no buyer credentials in env, leaving it to the human");
    return;
  }

  const onBotCheck = async () =>
    (await page
      .getByText(/captcha|are you a robot|verify (it's|it is) you|unusual activity/i)
      .count()
      .catch(() => 0)) > 0;

  try {
    const emailBox = page
      .locator('input#email:visible, input[name="login_email"]:visible, input[type="email"]:visible')
      .first();
    await emailBox.waitFor({ state: "visible", timeout: 60000 });
    await sleep(900);
    await fillHuman(emailBox, email);
    await sleep(600);

    const next = page.locator("#btnNext:visible, button:has-text(\"Next\")").first();
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await sleep(2600);
    }

    const pw = page
      .locator('input#password:visible, input[name="login_password"]:visible, input[type="password"]:visible')
      .first();
    await pw.waitFor({ state: "visible", timeout: 60000 });
    await sleep(800);
    await fillHuman(pw, password);
    await sleep(700);

    const login = page.locator("#btnLogin:visible, button#login-submit:visible, button:has-text(\"Log In\")").first();
    if (!(await login.isVisible().catch(() => false))) throw new Error("login button not found");
    await login.click();
    console.log("PAYPAL_AUTO: buyer signed in");
    /* the hermes wallet takes ~35 s to paint "Getting your wallet…" away */
    await page
      .getByRole("button", { name: /continue to review order/i })
      .first()
      .waitFor({ state: "visible", timeout: 60000 })
      .catch(() => {});
    await sleep(1200);

    /* wallet → review → agree: click whichever prompt is on screen, in order */
    const prompts = [
      /continue to review order/i,
      /agree and continue/i,
      /^agree$/i,
      /^pay now$/i,
      /complete purchase/i,
      /^continue$/i,
      /^pay$/i,
    ];
    for (let step = 0; step < 8; step += 1) {
      if (await onBotCheck()) {
        console.log("PAYPAL_AUTO: bot check on screen — stopping, no retry");
        return;
      }
      if (/status=(authorized|approved|success)/i.test(page.url())) {
        console.log("PAYPAL_AUTO: back at the app");
        return;
      }

      let clicked = false;
      for (const prompt of prompts) {
        const btn = page.getByRole("button", { name: prompt }).first();
        if (!(await btn.isVisible().catch(() => false))) continue;
        const terms = page.locator('input[type="checkbox"]:visible').first();
        if (await terms.isVisible().catch(() => false)) await terms.check({ timeout: 5000 }).catch(() => {});
        await btn.click({ timeout: 15000 }).catch(() => {});
        console.log(`PAYPAL_AUTO: approval step ${step + 1} (${prompt.source.replace(/[\\^$]/g, "")})`);
        clicked = true;
        await sleep(7000);
        break;
      }
      if (!clicked) await sleep(4000);
    }
  } catch (err) {
    console.log(`PAYPAL_AUTO: stopped (${String(err.message).split("\n")[0].slice(0, 70)})`);
  }
}

const notYet = (id) => async () => {
  throw new Error(`${id} is not implemented yet — selectors must be taken from the live UI first`);
};

const handlers = {
  /* S01 — landing: hero entrance, hover Sign up, hover Sign in, 10 s */
  async S01(page, shot, marks) {
    /* The vault is 177 webp frames (81 wheel + 96 keypad). On a cold cache only
       about three a second arrive, and the intro skips any phase whose frames
       are not there in time — which is why the earlier take showed a still
       vault. Fetch them, then reload: the take itself runs from cache. */
    const clipFrames = [
      ...JSON.parse(fs.readFileSync(path.resolve("src/config/wheel-manifest.json"), "utf8")),
      ...JSON.parse(fs.readFileSync(path.resolve("src/config/keypad-manifest.json"), "utf8")),
    ];

    await page.goto(FRONTEND, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    await page.getByText(/Freelancers deliver/i).first().waitFor({ state: "visible", timeout: 60000 });
    const warmed = await page.evaluate(async (urls) => {
      const results = await Promise.all(
        urls.map((u) => fetch(u, { cache: "force-cache" }).then((r) => r.ok).catch(() => false))
      );
      return results.filter(Boolean).length;
    }, clipFrames);
    console.log(`${warmed}/${clipFrames.length} vault frames warmed before the take`);
    await page.reload({ waitUntil: "domcontentloaded" });

    /* the entry gate paints before the copy: wait for the headline itself */
    await page.getByText(/Freelancers deliver/i).first().waitFor({ state: "visible", timeout: 60000 });
    marks.firstFrame = Date.now();
    marks.heroAt = marks.firstFrame;

    /* Park the pointer somewhere harmless first: a plain move does not count as
       a hover, but it puts the captured cursor on screen instead of at 0,0. */
    await page.mouse.move(1480, 900);

    /* The vault demos itself once the entrance lands: the keypad lights up,
       runs back down, then the wheel takes a full turn. Any hover cancels it,
       which is what the first take did at 4 s. 81 wheel frames and 96 keypad
       frames at 24 fps are 3.4 s and 4.0 s, and the intro paces itself on
       frames that are still loading, so give it room. */
    await sleep(30000);

    /* the CTAs are anchors wired by HeroButtons; the header carries its own
       Sign in, so pick the one lowest on the page — the hero row */
    const heroCta = async (href) => {
      const all = page.locator(`a[href="${href}"]`);
      const n = await all.count();
      let best = null;
      let bestY = -1;
      for (let i = 0; i < n; i += 1) {
        const box = await all.nth(i).boundingBox();
        if (box && box.y > bestY) {
          bestY = box.y;
          best = all.nth(i);
        }
      }
      return best;
    };

    const signUp = await heroCta("/signup");
    if (signUp) {
      await signUp.hover();
      await sleep(6500); // the whole 81-frame turn, then a beat on the landed wheel
    }
    await page.mouse.move(1480, 900); // leave the button, let the wheel reverse
    await sleep(1600);

    const signIn = await heroCta("/signin");
    if (signIn) {
      await signIn.hover();
      await sleep(3400); // keypad runs up to the lit-keys frame (K1 = 48 of 96)
    }
    await page.mouse.move(1480, 900);
    await sleep(1800);
  },
  /* S02 — Omar signs up on camera, lands on an empty freelancer dashboard.
     A fresh address each run, because the address is the identity: signing up
     an existing one answers 409 and the take would die on camera. */
  async S02(page, shot, marks) {
    /* fixed demo identities come from demo.env when they are set, so the same
       two accounts are created on camera; otherwise fall back to a generated
       pair, because signing up an existing address answers 409. */
    const stamp = Date.now().toString(36).slice(-6);
    const fixed = Boolean(
      process.env.FREELANCER_EMAIL && process.env.FREELANCER_PASSWORD && process.env.CLIENT_EMAIL && process.env.CLIENT_PASSWORD,
    );
    const freelancer = {
      name: process.env.DEMO_FREELANCER_NAME || "Omar Walied",
      email: process.env.FREELANCER_EMAIL || `omar.${stamp}@vaultdemo.test`,
      password: process.env.FREELANCER_PASSWORD || generatedPassword(),
      paypal: process.env.FREELANCER_PAYPAL_EMAIL || `omar.payout.${stamp}@vaultdemo.test`,
    };
    const client = {
      name: process.env.DEMO_CLIENT_NAME || "Bruce Wayne",
      email: process.env.CLIENT_EMAIL || `bruce.${stamp}@vaultdemo.test`,
      password: process.env.CLIENT_PASSWORD || generatedPassword(),
    };
    if (fixed) console.log("using the fixed demo identities from demo.env");

    await page.goto(`${FRONTEND}/signup`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="role-freelancer"]').waitFor({ state: "visible", timeout: 60000 });
    marks.firstFrame = Date.now();
    await sleep(2200); // the card and its role strip settle

    await page.locator('[data-testid="role-freelancer"]').click();
    await page.locator("#signup-name").waitFor({ state: "visible", timeout: 20000 });
    await sleep(1800);

    await typeSlowly(page.locator("#signup-name"), freelancer.name);
    await sleep(600);
    await typeSlowly(page.locator("#signup-email"), freelancer.email);
    await sleep(600);
    await typeSlowly(page.locator("#signup-password"), freelancer.password);
    await sleep(600);
    await typeSlowly(page.locator("#signup-paypal"), freelancer.paypal);
    await sleep(1200);

    await page.locator('[data-testid="signup-submit"]').click();
    await page.getByText(/Your freelancer vault is open/i).waitFor({ state: "visible", timeout: 60000 });
    await sleep(3000);

    await page.getByRole("link", { name: /Go to Dashboard/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    /* the shell paints a loading skeleton first; the empty state is the point
       of the shot, so wait for the skeleton to leave, not just for the URL */
    await page
      .getByText(/loading dashboard/i)
      .waitFor({ state: "hidden", timeout: 30000 })
      .catch(() => {});
    /* shimmer cards outlive the loading line; the empty state is the point of
       the shot, so wait for its copy rather than a timer */
    await page
      .getByText(/No vaults yet/i)
      .waitFor({ state: "visible", timeout: 30000 })
      .catch(() => {});
    await sleep(4500);

    saveRun({ freelancer, client });
    console.log(`accounts written to .tmp/demo-run.json (freelancer …${freelancer.email.slice(-12)})`);
  },

  /* S03 — sign in as Omar, create the vault, upload v1, read the scan and the
     fee split, land on the invite code. */
  async S03(page, shot, marks) {
    const run = loadRun();
    if (!run.freelancer) throw new Error("S03 needs S02's account: run --shot S02 first");

    await page.goto(`${FRONTEND}/signin`, { waitUntil: "domcontentloaded" });
    await page.locator("#signin-email").waitFor({ state: "visible", timeout: 60000 });
    marks.firstFrame = Date.now();
    await sleep(1800);

    await typeSlowly(page.locator("#signin-email"), run.freelancer.email);
    await sleep(500);
    await typeSlowly(page.locator("#signin-password"), run.freelancer.password);
    await sleep(900);
    await page.locator('[data-testid="signin-submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    await page
      .getByText(/loading dashboard/i)
      .waitFor({ state: "hidden", timeout: 30000 })
      .catch(() => {});
    await sleep(2500);

    const drawer = await openDrawer(page);
    await sleep(2400); // the drawer's own entrance has to finish before a click lands
    await fillHuman(drawer.locator("input.fd-input").first(), "Corner Bean Coffee Website");
    await sleep(500);
    /* invite an address that already has an account: the API leaves the vault as
       a draft with no code when the invite cannot be delivered, and Bruce signs
       up in S04, after this vault exists. Both addresses are blurred on camera. */
    await fillHuman(
      drawer.locator('input[type="email"]').first(),
      process.env.CLIENT_EMAIL || run.client?.email || ""
    );
    await sleep(500);
    await fillHuman(drawer.locator("input.fd-input-money"), "200");
    await sleep(2000); // the "you receive about" line recalculates

    await page.getByRole("button", { name: /^Next$/ }).click();
    await sleep(1600);

    await page
      .locator('input[type="file"][aria-label="Choose a zip archive"]')
      .setInputFiles(path.resolve("scripts/demo-fixtures/corner-bean-v1.zip"));
    await page.locator(".fd-scan li").first().waitFor({ state: "visible", timeout: 20000 });
    await sleep(3000); // structure, types, size, hash run in front of the camera

    await page.getByRole("button", { name: /^Next$/ }).click();
    await sleep(3200); // review + fee breakdown, held

    await page.getByRole("button", { name: /Create & invite client/i }).click();
    /* the toast says "Vault created." too, so target the panel heading */
    await page.locator(".fd-success-h").waitFor({ state: "visible", timeout: 120000 });
    await sleep(4000);
    /* The code only exists when the invite actually went out (the client has to
       have an account). When it does, hold on it and copy the link on camera so
       the beat reads as "here is the code", rather than ending on a panel that
       silently has none. */
    if (await page.locator(".fd-code").count()) {
      await sleep(1500);
      await page
        .getByRole("button", { name: /copy invite link/i })
        .first()
        .click({ timeout: 8000 })
        .catch(() => {});
      await sleep(3200);
    }

    const inviteCode = (await page.locator(".fd-code").first().innerText().catch(() => "")).trim();
    saveRun({ inviteCode });

    /* hidden setup: read the vault id back so later shots can address it */
    try {
      const token = await apiToken(run.freelancer.email, run.freelancer.password);
      const res = await fetch(`${API}/vaults`, { headers: { authorization: `Bearer ${token}` } });
      const vaults = listOf(await res.json());
      const match = vaults.find((v) => /corner bean/i.test(v.title || v.project || ""));
      saveRun({ vaultId: match?.id ?? null });
      console.log(`invite code captured=${Boolean(inviteCode)} vault id=${match?.id ? "…" + String(match.id).slice(-4) : "not found"}`);
    } catch (err) {
      console.log(`vault id lookup failed: ${err.message}`);
    }

    /* Close the drawer before the invite beat: Done sits at the bottom of the
       success panel and a click that lands while a toast covers it leaves the
       drawer open, which ended the previous take on a static panel. Try Done,
       then the header close, then Escape, and only move on once it is gone. */
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if ((await page.getByRole("dialog").count()) === 0) break;
      await page.getByRole("button", { name: /^Done$/ }).first().click({ timeout: 5000 }).catch(() => {});
      await sleep(900);
      if ((await page.getByRole("dialog").count()) === 0) break;
      await page
        .locator('[role="dialog"] button[aria-label*="lose" i]')
        .first()
        .click({ timeout: 3000 })
        .catch(() => {});
      await sleep(900);
      if ((await page.getByRole("dialog").count()) === 0) break;
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(900);
    }
    await sleep(2200);

    /* The invite code is minted by the card's "Copy invite link" and reported in a
       toast: the drawer only renders a code when the invite went out with the
       create. Clicking it here puts the code on camera either way, and the toast
       is what carries it. */
    const invite = page.getByRole("button", { name: /copy invite link/i }).first();
    if (await invite.count()) {
      await invite.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(1200);
      await invite.click({ timeout: 8000 }).catch(() => {});
      await sleep(1200);
      const toastText = (await page.locator(".dash-toast-text").allInnerTexts().catch(() => [])).join(" ");
      const found = /VL-[A-Z0-9]{4}-[A-Z0-9]{4}/i.exec(toastText);
      if (found) {
        saveRun({ inviteCode: found[0].toUpperCase() });
        console.log(`invite code minted on camera=${Boolean(found[0])}`);
      }
      await sleep(4000); // hold while the toast is readable
    }
  },

  /* S04 — Bruce signs up, then joins with the code from S03. */
  async S04(page, shot, marks) {
    const run = loadRun();
    if (!run.client) throw new Error("S04 needs S02's client identity: run --shot S02 first");
    if (!run.inviteCode) throw new Error("S04 needs an invite code: run --shot S03 first");

    await page.goto(`${FRONTEND}/signup`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="role-client"]').waitFor({ state: "visible", timeout: 60000 });
    marks.firstFrame = Date.now();
    await sleep(2200);

    await page.locator('[data-testid="role-client"]').click();
    await page.locator("#signup-name").waitFor({ state: "visible", timeout: 20000 });
    await sleep(1600);

    await typeSlowly(page.locator("#signup-name"), run.client.name);
    await sleep(600);
    await typeSlowly(page.locator("#signup-email"), run.client.email);
    await sleep(600);
    await typeSlowly(page.locator("#signup-password"), run.client.password);
    await sleep(1100);

    await page.locator('[data-testid="signup-submit"]').click();
    await page.getByText(/Your client vault is open/i).waitFor({ state: "visible", timeout: 60000 });
    await sleep(2600);

    await page.getByRole("link", { name: /Go to Dashboard/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    await sleep(2600);

    await page.getByRole("button", { name: /Join a vault/i }).first().click();
    const codeInput = page.locator('[aria-label="Invite code"]');
    await codeInput.waitFor({ state: "visible", timeout: 20000 });
    await sleep(1400);
    await typeSlowly(codeInput, run.inviteCode);
    await sleep(900);

    await page.getByRole("button", { name: /^Join$/ }).first().click();
    await page.getByText(/joined/i).first().waitFor({ state: "visible", timeout: 45000 });
    await sleep(3500); // the joined vault card
  },
  /* S05 — Bruce pays: the PayPal stage, the sandbox approval (human), the
     return, then the hold recorded. The script never touches the PayPal form;
     it waits for the approval to come back to /vault/<id>?status=authorized. */
  async S05(page, shot, marks) {
    const run = loadRun();
    if (!run.client?.email) throw new Error("S05 needs S02's client identity: run --shot S02 first");
    if (!run.vaultId) throw new Error("S05 needs the vault from S03: run --shot S03 first");

    await signInAs(page, run.client, marks);
    page.setDefaultNavigationTimeout(120000);
    for (let attempt = 1; ; attempt += 1) {
      try {
        await page.goto(`${FRONTEND}/vault/${run.vaultId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        console.log(`room load retry ${attempt}`);
        await sleep(3000);
      }
    }
    await page.locator(".paypal-btn-stage:visible").first().waitFor({ state: "visible", timeout: 120000 });
    if (!marks.firstFrame) marks.firstFrame = Date.now();

    /* the room has to paint the amount and the hold hint before the button */
    await page.getByText(/Nothing is spent/i).first().waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    await sleep(3200);

    const stageFrame = page.locator(".paypal-btn-stage:visible iframe").first();
    await stageFrame.waitFor({ state: "visible", timeout: 120000 });
    await sleep(2000);

    /* The SDK button hands off to PayPal in one of three shapes: a popup page,
       PayPal's in-page "secure paypal browser / Click to Continue" overlay when
       the popup is not available, or the app's own .paypal-btn-direct fallback.
       Take whichever actually appears, then log the buyer in wherever the form
       landed. */
    /* --human-paypal: the buyer does the PayPal click in the headed window and
       the take keeps recording and waiting for the hold. Nothing is automated
       past this point, so a bot check or a popup quirk cannot strand the run. */
    if (has("human-paypal")) {
      await page.bringToFront();
      console.log("PAYPAL_READY: click Pay with PayPal, sign in as the sandbox buyer, then approve.");
      console.log("WAITING: up to 10 minutes for the hold; recording continues throughout.");
      const until = Date.now() + 10 * 60 * 1000;
      let handoffStatus = "unknown";
      while (Date.now() < until) {
        handoffStatus = await apiVaultStatus(run.vaultId, run.client);
        if (/AUTHORIZED/i.test(String(handoffStatus))) break;
        await sleep(4000);
      }
      console.log(`vault status after approval: ${handoffStatus}`);
      await page
        .goto(`${FRONTEND}/vault/${run.vaultId}`, { waitUntil: "domcontentloaded", timeout: 120000 })
        .catch(() => {});
      await page.locator(".room-decision").first().waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
      await sleep(5000);
      return;
    }

    const context = page.context();
    const newestPopup = () => context.pages().filter((p) => p !== page).pop();
    let target = null;

    await page
      .frames()
      .find((fr) => /paypal\.com\/smart\/buttons/i.test(fr.url()))
      ?.locator('[role="button"][aria-label*="PayPal" i], [data-funding-source="paypal"]')
      .first()
      .click({ timeout: 15000 })
      .catch(() => {});

    /* the SDK needs ~10 s to give up and expose the overlay / direct fallback,
       so watch for any of the three handoff shapes instead of looking once */
    const handoffDeadline = Date.now() + 20000;
    while (Date.now() < handoffDeadline && !target) {
      target = newestPopup() || null;
      if (target) {
        console.log("PAYPAL_OPEN (popup)");
        break;
      }
      if (/^https:\/\/[^/]*paypal\.com/i.test(page.url())) {
        target = page;
        console.log("PAYPAL_OPEN (same tab)");
        break;
      }

      const cont = page.getByText(/Click to Continue/i).first();
      if (await cont.isVisible().catch(() => false)) {
        await cont.click().catch(() => {});
        await sleep(4000);
        target = newestPopup() || (/^https:\/\/[^/]*paypal\.com/i.test(page.url()) ? page : null);
        if (target) {
          console.log("PAYPAL_OPEN (overlay)");
          break;
        }
      }

      const direct = page.locator(".paypal-btn-direct:visible").first();
      if (await direct.isVisible().catch(() => false)) {
        await direct.click().catch(() => {});
        await sleep(4000);
        target = newestPopup() || (/^https:\/\/[^/]*paypal\.com/i.test(page.url()) ? page : null);
        if (target) {
          console.log("PAYPAL_OPEN (direct)");
          break;
        }
      }
      await sleep(2000);
    }

    if (target) {
      await target.waitForLoadState("domcontentloaded").catch(() => {});
      if (target !== page) {
        /* the checkout opens as its own window, so the page video never sees it;
           keep that window's recording and splice it in after the run */
        marks.popupVideo = target.video();
        await target.bringToFront().catch(() => {});
        await sleep(2500);
      }
      await paypalBuyerLogin(target);
      await target.waitForURL(/status=(authorized|approved|success)/i, { timeout: 90000 }).catch(() => {});
      await sleep(1500);
      if (target !== page) {
        await target.close().catch(() => {});
        await page.bringToFront().catch(() => {});
      }
    } else {
      /* the click did create the order (the vault carries an order id) even
         though the SDK never opened its window, so take the same approval URL
         the app's own "Open PayPal" fallback uses */
      const orderId = await apiVaultOrder(run.vaultId, run.client);
      if (orderId) {
        console.log("PAYPAL_OPEN (order link)");
        await page.goto(`https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`, {
          waitUntil: "domcontentloaded",
          timeout: 120000,
        });
        target = page;
        await sleep(3000);
        await paypalBuyerLogin(page);
        await page.waitForURL(/status=(authorized|approved|success)/i, { timeout: 90000 }).catch(() => {});
        await sleep(1500);
      } else {
        console.log("PAYPAL_OPEN: no handoff and no order id");
      }
    }
    console.log("PAYPAL_RETURN seen");

    const popup = null;

    /* the room reconciles on its own every 8 s; wait for the hold to land */
    let status = "unknown";
    for (let i = 0; i < 20; i += 1) {
      status = await apiVaultStatus(run.vaultId, run.client);
      if (/AUTHORIZED/i.test(String(status))) break;
      await sleep(3000);
    }
    console.log(`vault status after approval: ${status}`);

    /* bring the tab back to the room so the paid state is on screen */
    if (popup) await popup.close().catch(() => {});
    await page.bringToFront().catch(() => {});
    await page
      .goto(`${FRONTEND}/vault/${run.vaultId}`, { waitUntil: "domcontentloaded", timeout: 120000 })
      .catch(() => {});
    await page.locator(".room-decision").first().waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    await sleep(4000);
  },
  /* S06 — the audit agent answers. Bruce asks one question in the funded room
     and the model's reply streams in. Timings measured on this account in a
     1920x1080 window: typing indicator at 0.2 s, answer text from 9 s, stream
     complete at 22.8 s. The wait *is* the answer arriving, so the take must not
     end on the phase line — it ends when the text stops growing. */
  async S06(page, shot, marks) {
    const run = loadRun();
    if (!run.client?.email) throw new Error("S06 needs S02's client identity: run --shot S02 first");
    if (!run.vaultId) throw new Error("S06 needs the vault from S03: run --shot S03 first");

    /* the two placeholder lines the bubble shows while the model works; neither
       is an answer, and either one is what a careless take would end on */
    const PHASE = /checking the deliverables|preparing the audit report/i;
    const QUESTION = "What was delivered, and is anything missing?";

    await signInAs(page, run.client, marks);
    page.setDefaultNavigationTimeout(120000);
    await page.goto(`${FRONTEND}/vault/${run.vaultId}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    const box = page.locator('[aria-label="Ask the audit agent"]');
    await box.waitFor({ state: "visible", timeout: 120000 });
    if (!marks.firstFrame) marks.firstFrame = Date.now();
    await sleep(2600); // the stepper, deliverables and checks paint before typing

    await typeSlowly(box, QUESTION, 45); // ~5 s at the measured pace
    await sleep(700);
    const askedAt = Date.now();
    await box.press("Enter");

    /* 0.2 s: the phase line appears. Hold it long enough to read, then insist on
       something that is not it. */
    await page.getByText(PHASE).first().waitFor({ state: "visible", timeout: 25000 });
    const indicatorAt = Date.now();
    await sleep(1300);

    /* 9 s: the answer starts. The standing line is the first AI bubble, so the
       answer is the last one — and only once it is long enough and no longer
       the phase text. */
    const answer = page.locator('.room-msg[data-role="ai"]').last();
    let text = "";
    const answerDeadline = Date.now() + 120000;
    while (Date.now() < answerDeadline) {
      const bubbles = await page.locator('.room-msg[data-role="ai"]').count().catch(() => 0);
      if (bubbles >= 2) {
        text = (await answer.innerText().catch(() => "")).trim();
        if (text.length > 60 && !PHASE.test(text)) break;
      }
      await sleep(250);
    }
    if (!text || PHASE.test(text)) {
      throw new Error("the agent never left the phase line: no answer rendered");
    }
    const answerAt = Date.now();

    /* 22.8 s: the stream stops. Wait for the text to stop growing, which is the
       only reliable end-of-answer signal here, then hold so the finished answer
       and its source chips read on camera. */
    let lastLen = -1;
    let stableSince = Date.now();
    for (let i = 0; i < 400; i += 1) {
      const now = (await answer.innerText().catch(() => "")).trim();
      if (now.length !== lastLen) {
        lastLen = now.length;
        stableSince = Date.now();
      } else if (Date.now() - stableSince > 2600) {
        break;
      }
      await sleep(300);
    }
    const doneAt = Date.now();
    await sleep(3800);

    console.log(
      `S06 indicator ${((indicatorAt - askedAt) / 1000).toFixed(1)} s, answer ${((answerAt - askedAt) / 1000).toFixed(1)} s, complete ${((doneAt - askedAt) / 1000).toFixed(1)} s (${lastLen} chars)`,
    );
  },
  /* S07 — the client sends the work back. The room has one failed check, Bruce
     opens the review dialog and writes the note that names what is missing.
     Only this half is filmable: in a real session the freelancer card offers no
     upload or resubmit for a vault under review, so the v2 resubmit happens
     through the API afterwards. */
  async S07(page, shot, marks) {
    const run = loadRun();
    if (!run.client?.email) throw new Error("S07 needs S02's client identity: run --shot S02 first");
    if (!run.vaultId) throw new Error("S07 needs the vault from S03: run --shot S03 first");

    /* the note field is a single line, so this is short enough to read in full
       on camera instead of scrolling out of the box */
    const NOTE = "Add the README and the test log, then resubmit.";

    await signInAs(page, run.client, marks);
    page.setDefaultNavigationTimeout(120000);
    await page.goto(`${FRONTEND}/vault/${run.vaultId}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    const review = page.getByRole("button", { name: /review failed checks/i }).first();
    await review.waitFor({ state: "visible", timeout: 120000 });
    if (!marks.firstFrame) marks.firstFrame = Date.now();
    await sleep(3200); // the failed check, the locked payment and the hint read

    await review.click();
    const dialog = page.getByRole("dialog").first();
    await dialog.waitFor({ state: "visible", timeout: 20000 });
    await sleep(2200); // the waiver row and the note field

    const note = dialog.locator("textarea").first();
    await typeSlowly(note, NOTE, 26);
    await sleep(1400);

    await dialog.getByRole("button", { name: /^request a revision$/i }).first().click();
    await page.getByText(/revision requested/i).first().waitFor({ state: "visible", timeout: 45000 });
    await sleep(4200);
    console.log("S07 revision requested on camera");
  },
  S08: notYet("S08"),
  S09: notYet("S09"),
  S10: notYet("S10"),
  S11: notYet("S11"),
  S12: notYet("S12"),
  S13: notYet("S13"),
  S14: notYet("S14"),
};

/* --measure: print the 1920x1080 boxes the manifest needs, no recording */
if (has("measure")) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=CalculateNativeWinOcclusion",
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto(FRONTEND, { waitUntil: "domcontentloaded" });
  await page.getByText(/Freelancers deliver/i).first().waitFor({ state: "visible", timeout: 60000 });
  await sleep(3500);
  const lowest = async (href) => {
    const all = page.locator(`a[href="${href}"]`);
    let best = null;
    let bestY = -1;
    for (let i = 0; i < (await all.count()); i += 1) {
      const box = await all.nth(i).boundingBox();
      if (box && box.y > bestY) {
        bestY = box.y;
        best = box;
      }
    }
    return best;
  };
  const out = { headline: await page.locator("h1").first().boundingBox(), signup: await lowest("/signup"), signin: await lowest("/signin") };
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(0);
}

if (has("list")) {
  for (const s of SHOTS) console.log(`${s.id}  ${s.who.padEnd(6)} ~${String(s.seconds).padStart(3)}s  ${s.file}.mp4  — ${s.note}`);
  console.log(`\nfrontend: ${FRONTEND}\napi: ${API}\ncredentials present: omar=${Boolean(creds.omar.email && creds.omar.password)} bruce=${Boolean(creds.bruce.email && creds.bruce.password)}`);
  process.exit(0);
}

const wanted = valueOf("shot") ? SHOTS.filter((s) => s.id === valueOf("shot")) : has("all") ? SHOTS : [];
if (!wanted.length) {
  console.log("nothing selected: pass --list, --shot S01 or --all");
  process.exit(1);
}
/* S05 no longer needs stdin: it waits for PayPal's return URL, so it can run
   from a background job while the buyer approves in the headed window. */
for (const shot of wanted) {
  console.log(`\n▶ ${shot.id} (${shot.note})`);
  await record(shot);
}
