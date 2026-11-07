#!/usr/bin/env node
/* Focused live security pass. It creates only e2e- accounts and its own vault.
   No token, password or full id is printed. */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const APP = (process.env.E2E_FRONTEND_URL || "https://vault-lance-ai.vercel.app").replace(/\/+$/, "");
const API = (() => {
  const raw = (process.env.E2E_API_URL || "https://vaultlance-ai.fly.dev").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
})();
const EVIDENCE = path.resolve("docs/e2e/evidence");
fs.mkdirSync(EVIDENCE, { recursive: true });
const stamp = Date.now();
const results = [];
const record = (id, ok, detail) => {
  results.push({ id, result: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} — ${detail}`);
};
const last4 = (v) => (v ? `…${String(v).slice(-4)}` : "none");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname, { method = "GET", token, body, headers = {}, form } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      ...(form ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
const codeOf = (r) => r.json?.error?.code || "";

async function register(role) {
  const email = `e2e-${stamp}-${role.toLowerCase()}-${crypto.randomBytes(3).toString("hex")}@example.com`;
  const password = `Vp-${crypto.randomBytes(18).toString("base64url")}`;
  const fullName = role === "FREELANCER" ? "Eve Security" : "Cora Security";
  const r = await api("/auth/register", { method: "POST", body: { email, password, fullName, role } });
  if (r.status !== 201) throw new Error(`${role} setup answered ${r.status} ${codeOf(r)}`);
  return { email, password, token: r.json.data.token, id: r.json.data.user.id };
}

try {
  let f, c, stranger;
  try { f = await register("FREELANCER"); c = await register("CLIENT"); stranger = await register("CLIENT"); }
  catch (e) { record("A0", false, e.message); throw e; }

  const dup = await api("/auth/register", {
    method: "POST",
    body: { email: f.email, password: "Vp-NeverUsed123!", fullName: "Eve Duplicate", role: "FREELANCER" },
  });
  record("A1 duplicate email", dup.status === 409, `status ${dup.status}, code ${codeOf(dup) || "none"}`);

  const weak = await api("/auth/register", {
    method: "POST",
    body: { email: `e2e-${stamp}-weak@example.com`, password: "short", fullName: "Eve Weak", role: "FREELANCER" },
  });
  record("A2 weak password", weak.status === 400 || weak.status === 422, `status ${weak.status}`);

  const missing = await api("/auth/register", { method: "POST", body: { email: `e2e-${stamp}-missing@example.com` } });
  record("A3 missing fields", missing.status === 400 || missing.status === 422, `status ${missing.status}`);

  const badRole = await api("/auth/register", {
    method: "POST",
    body: { email: `e2e-${stamp}-role@example.com`, password: "Vp-NeverUsed123!", fullName: "Eve Role", role: "ADMIN" },
  });
  record("A4 invalid role", badRole.status === 400 || badRole.status === 422, `status ${badRole.status}`);

  const badLogin = await api("/auth/login", { method: "POST", body: { email: f.email, password: "definitely-wrong" } });
  record("A5 wrong password is rejected", badLogin.status === 401, `status ${badLogin.status}`);

  const tampered = `${f.token.slice(0, -1)}${f.token.endsWith("a") ? "b" : "a"}`;
  const badToken = await api("/auth/me", { token: tampered });
  record("B1 tampered bearer is rejected", badToken.status === 401, `status ${badToken.status}`);

  const resetKnown = await api("/auth/password-reset/request", { method: "POST", body: { email: f.email } });
  const resetUnknown = await api("/auth/password-reset/request", { method: "POST", body: { email: `e2e-${stamp}-nobody@example.com` } });
  const sameResetAnswer =
    resetKnown.status === resetUnknown.status &&
    resetKnown.json?.message === resetUnknown.json?.message &&
    Boolean(resetKnown.json?.data?.sent) === Boolean(resetUnknown.json?.data?.sent);
  record("B2 reset request is non-enumerating", sameResetAnswer, `statuses ${resetKnown.status}/${resetUnknown.status}`);

  /* inspect deliberately answers 200 with state "invalid" so the page can show a
     reason; the security property is that the forged token cannot reset anything */
  const badResetToken = await api(`/auth/password-reset/${encodeURIComponent("e2e-invalid-token")}`);
  const forgedConfirm = await api("/auth/password-reset/confirm", {
    method: "POST",
    body: { token: "e2e-invalid-token", password: "Vp-ForgedNeverUsed1!" },
  });
  record(
    "B3 a forged reset token cannot reset a password",
    badResetToken.json?.data?.state === "invalid" &&
      forgedConfirm.status === 400 &&
      codeOf(forgedConfirm) === "RESET_TOKEN_INVALID",
    `inspect state ${badResetToken.json?.data?.state ?? "none"}; confirm ${forgedConfirm.status} ${codeOf(forgedConfirm) || "none"}`
  );

  const created = await api("/vaults", {
    method: "POST",
    token: f.token,
    body: { title: `e2e-${stamp}-xss-<img src=x onerror=window.__xss=1>`, description: "<svg onload=window.__xss=2>", amount: 5, currency: "USD" },
  });
  if (created.status !== 201) throw new Error(`vault create ${created.status} ${codeOf(created)}`);
  const vaultId = created.json.data.id;
  console.log("VAULT", last4(vaultId));

  const form = new FormData();
  form.append("file", new Blob(["e2e security delivery\n"], { type: "text/plain" }), "e2e-delivery.txt");
  const uploaded = await fetch(`${API}/uploads/${vaultId}`, { method: "POST", headers: { authorization: `Bearer ${f.token}` }, body: form });
  record("C1 own upload accepted", uploaded.status === 201, `status ${uploaded.status}`);

  const submitted = await api(`/vaults/${vaultId}/submit`, { method: "POST", token: f.token });
  record("C2 submit locks the manifest", submitted.status === 200 && /^[a-f0-9]{64}$/.test(String(submitted.json?.data?.manifestSha256)), `status ${submitted.status}`);

  const invite = await api(`/vaults/${vaultId}/invite-code`, { method: "POST", token: f.token });
  const joinCode = invite.json?.data?.code;
  record("C3 invite code minted", [200, 201].includes(invite.status) && /^VL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(joinCode)), `status ${invite.status}`);

  const joined = await api("/vaults/join", { method: "POST", token: c.token, body: { code: joinCode } });
  record("C4 invited client joins", joined.status === 200, `status ${joined.status}`);

  const strangerRead = await api(`/vaults/${vaultId}`, { token: stranger.token });
  record("D1 other client cannot read the vault", strangerRead.status === 403 || strangerRead.status === 404, `status ${strangerRead.status}`);

  const strangerFiles = await api(`/uploads/vault/${vaultId}/files`, { token: stranger.token });
  record("D2 other client cannot list files", strangerFiles.status === 403 || strangerFiles.status === 404, `status ${strangerFiles.status}`);

  const strangerApprove = await api(`/vaults/${vaultId}/approve`, { method: "POST", token: stranger.token, body: {} });
  record("D3 other client cannot approve", strangerApprove.status === 403 || strangerApprove.status === 404, `status ${strangerApprove.status}`);

  const clientMint = await api(`/vaults/${vaultId}/invite-code`, { method: "POST", token: c.token });
  record("D4 client cannot mint a freelancer invite", clientMint.status === 403, `status ${clientMint.status}`);

  /* The API authenticates with a bearer header only, so a foreign page has no
     ambient credential to ride; the check that matters is that it cannot mutate
     without one and that nothing is ever set as a cookie. */
  const foreignRaw = await fetch(`${API}/vaults/${vaultId}/approve`, {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/json" },
    body: "{}",
  });
  record(
    "E1 foreign-origin mutation has no session cookie to ride",
    foreignRaw.status === 401 && !foreignRaw.headers.get("set-cookie"),
    `status ${foreignRaw.status}; set-cookie ${foreignRaw.headers.get("set-cookie") ? "present" : "absent"}`
  );

  const preflight = await fetch(`${API}/vaults/${vaultId}/approve`, {
    method: "OPTIONS",
    headers: { origin: "https://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
  });
  record("E2 foreign origin gets no CORS grant", !preflight.headers.get("access-control-allow-origin"), `ACAO ${preflight.headers.get("access-control-allow-origin") || "absent"}`);

  const badWebhook = await api("/webhooks/paypal", {
    method: "POST",
    body: { id: `e2e-evt-${stamp}`, event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { custom_id: vaultId } },
  });
  record("E3 unsigned webhook is refused", badWebhook.status === 400, `status ${badWebhook.status}`);

  const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"], ignoreDefaultArgs: ["--enable-automation"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ token, email }) => {
      sessionStorage.setItem("vl_token", token);
      sessionStorage.setItem("vl.dash.session", JSON.stringify({ email, role: "client", since: Date.now() }));
    }, { token: c.token, email: c.email });
    const page = await context.newPage();
    await page.goto(`${APP}/vault/${vaultId}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await sleep(3000);
    const xss = await page.evaluate(() => window.__xss ?? null);
    const body = await page.locator("body").innerText().catch(() => "");
    record("D5 stored title/brief does not execute", xss === null, `window.__xss=${String(xss)}; room text ${body.includes("e2e-") ? "rendered" : "not rendered"}`);
  } finally {
    await browser.close().catch(() => {});
  }

  const failures = results.filter((r) => r.result === "FAIL").length;
  console.log(`SUMMARY ${results.length - failures}/${results.length} passed`);
  fs.writeFileSync(path.join(EVIDENCE, "security.json"), `${JSON.stringify({ runId: stamp, api: API, app: APP, results }, null, 2)}\n`);
  process.exitCode = failures ? 1 : 0;
} catch (e) {
  console.error("SECURITY_FATAL", e?.name, String(e?.message || e).slice(0, 500));
  fs.writeFileSync(path.join(EVIDENCE, "security.json"), `${JSON.stringify({ runId: stamp, results, fatal: String(e?.message || e) }, null, 2)}\n`);
  process.exitCode = 1;
}
