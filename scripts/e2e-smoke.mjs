#!/usr/bin/env node
/* e2e:smoke — the fast live check: the API is awake, two accounts can be made,
   a vault can be funded-ready (create, upload, lock manifest, invite, join) and
   the delivery stays locked until the money moves.

   It deliberately stops before PayPal: no capture, no payout, no restart drill.
   Those live in scripts/e2e-live-v2.mjs. Prints only masked ids. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const API = (() => {
  const raw = (process.env.E2E_API_URL || "https://vaultlance-ai.fly.dev").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
})();
const HOST = API.replace(/\/api$/, "");
const EVIDENCE = path.resolve("docs/e2e/evidence");
fs.mkdirSync(EVIDENCE, { recursive: true });
const stamp = Date.now();
const steps = [];
const started = Date.now();
const last4 = (v) => `…${String(v).slice(-4)}`;

async function api(pathname, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

function step(name, ok, detail) {
  steps.push({ name, result: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
  if (!ok) throw new Error(`${name} failed: ${detail}`);
}

async function register(role, label) {
  const email = `e2e-${stamp}-smoke-${label}@example.com`;
  const password = `Vp-${crypto.randomBytes(18).toString("base64url")}`;
  const fullName = role === "FREELANCER" ? "Sam Smoke" : "Cara Smoke";
  const r = await api("/auth/register", { method: "POST", body: { email, password, fullName, role } });
  if (r.status !== 201) throw new Error(`register ${role} answered ${r.status}`);
  return { email, token: r.json.data.token };
}

try {
  const health = await fetch(`${HOST}/health`);
  step("API health", health.ok, `status ${health.status}`);

  const f = await register("FREELANCER", "freelancer");
  const c = await register("CLIENT", "client");
  step("two accounts registered", true, `codes ${last4(f.email.split("@")[0])}`);

  const created = await api("/vaults", {
    method: "POST",
    token: f.token,
    body: { title: `e2e-${stamp}-smoke delivery`, amount: 12, currency: "USD" },
  });
  if (created.status !== 201) throw new Error(`vault create answered ${created.status}`);
  const vaultId = created.json.data.id;
  step("vault created", Boolean(vaultId), `vault ${last4(vaultId)}`);

  const form = new FormData();
  form.append("file", new Blob([`e2e smoke ${stamp}\n`], { type: "text/plain" }), `e2e-${stamp}-smoke.txt`);
  const upload = await fetch(`${API}/uploads/${vaultId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.token}` },
    body: form,
  });
  step("delivery uploaded", upload.status === 201, `status ${upload.status}`);

  const submitted = await api(`/vaults/${vaultId}/submit`, { method: "POST", token: f.token });
  const hash = String(submitted.json?.data?.manifestSha256 || "");
  step("manifest locked", submitted.status === 200 && /^[a-f0-9]{64}$/.test(hash), `sha256 ${hash.slice(0, 8)}…`);

  const invite = await api(`/vaults/${vaultId}/invite-code`, { method: "POST", token: f.token });
  const code = String(invite.json?.data?.code || "");
  step("invite code minted", /^VL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), `code ${code.slice(0, 7)}…`);

  const joined = await api("/vaults/join", { method: "POST", token: c.token, body: { code } });
  step("client joined", joined.status === 200, `status ${joined.status}`);

  const files = await api(`/uploads/vault/${vaultId}/files`, { token: c.token });
  const fileId = files.json?.data?.[0]?.id ?? files.json?.data?.files?.[0]?.id;
  const download = fileId
    ? await api(`/vaults/${vaultId}/files/${fileId}/download`, { token: c.token })
    : { status: 0 };
  step("delivery stays locked before payment", Boolean(fileId) && download.status === 403, `download ${download.status}`);

  const leaked = await api(`/vaults/${vaultId}`, { token: (await register("CLIENT", "stranger")).token });
  step("a stranger is refused", leaked.status === 403 || leaked.status === 404, `status ${leaked.status}`);

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`SMOKE PASS ${steps.length}/${steps.length} in ${seconds}s`);
  fs.writeFileSync(
    path.join(EVIDENCE, "smoke.json"),
    `${JSON.stringify({ runId: stamp, api: API, seconds, steps }, null, 2)}\n`
  );
} catch (e) {
  const seconds = Math.round((Date.now() - started) / 1000);
  console.error("SMOKE FAIL", String(e?.message || e).slice(0, 300), `after ${seconds}s`);
  fs.writeFileSync(
    path.join(EVIDENCE, "smoke.json"),
    `${JSON.stringify({ runId: stamp, api: API, seconds, steps, fatal: String(e?.message || e) }, null, 2)}\n`
  );
  process.exitCode = 1;
}
