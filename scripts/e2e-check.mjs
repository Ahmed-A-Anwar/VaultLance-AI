#!/usr/bin/env node
/**
 * e2e-check.mjs — PASS/FAIL per step against a deployed API.
 *
 * Every credential comes from the environment and is never printed. Steps that
 * need the PayPal-hosted approval page or a real sandbox balance are marked
 * MANUAL and skipped here.
 */
const API = process.env.API_URL || "https://vaultlance-ai.fly.dev/api";
const ORIGIN = API.replace(/\/api\/?$/, "");
const F = { email: process.env.E2E_FREELANCER_EMAIL, password: process.env.E2E_FREELANCER_PASSWORD };
const C = { email: process.env.E2E_CLIENT_EMAIL, password: process.env.E2E_CLIENT_PASSWORD };

let pass = 0;
let fail = 0;

function record(step, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, { method = "GET", token, body, headers = {}, raw } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(raw ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw ? raw : body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON is fine for the failure cases */
  }
  return { status: res.status, json };
}

const codeOf = (res) => res.json?.error?.code || "";
const login = async (who) => (await api("/auth/login", { method: "POST", body: who })).json?.data?.token;

async function main() {
  if (!F.email || !C.email) {
    console.log("Set E2E_FREELANCER_EMAIL/PASSWORD and E2E_CLIENT_EMAIL/PASSWORD.");
    process.exit(2);
  }

  const health = await fetch(`${ORIGIN}/health`).then((r) => r.json());
  record("1 health answers with a version", Boolean(health.version), health.status);

  const freelancer = await login(F);
  const client = await login(C);
  record("1 both sandbox accounts log in", Boolean(freelancer && client));

  const created = await api("/vaults", {
    method: "POST",
    token: freelancer,
    body: { title: `E2E ${Date.now()}`, description: "e2e", amount: 25, currency: "USD" },
  });
  const vaultId = created.json?.data?.id;
  record("2 freelancer creates a vault", created.status === 201 && Boolean(vaultId), vaultId);

  const submitEarly = await api(`/vaults/${vaultId}/submit`, { method: "POST", token: freelancer });
  record("2 submit refuses an empty delivery", codeOf(submitEarly) === "NO_FILES", codeOf(submitEarly));

  const form = new FormData();
  form.append("file", new Blob(["e2e delivery\n"], { type: "text/plain" }), "delivery.txt");
  const uploaded = await fetch(`${API}/uploads/${vaultId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${freelancer}` },
    body: form,
  });
  record("2 freelancer uploads a deliverable", uploaded.status === 201);

  const submitted = await api(`/vaults/${vaultId}/submit`, { method: "POST", token: freelancer });
  const sha = submitted.json?.data?.manifestSha256;
  record("2 submit locks the manifest and returns a SHA-256", /^[a-f0-9]{64}$/.test(String(sha)), String(sha).slice(0, 12));

  const invited = await api(`/vaults/${vaultId}/invite-code`, { method: "POST", token: freelancer });
  const invite = invited.json?.data?.code;
  record("2 invite code minted", /^VL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(invite)));

  const wrongCode = await api(`/vaults/${vaultId}/join`, { method: "POST", token: client, body: { code: "VL-0000-0000" } });
  record("3 a wrong code is a 404", wrongCode.status === 404);

  const joined = await api(`/vaults/${vaultId}/join`, { method: "POST", token: client, body: { code: invite } });
  record("3 client joins with the code", joined.status === 200, joined.json?.data?.status);

  const reused = await api(`/vaults/${vaultId}/join`, { method: "POST", token: client, body: { code: invite } });
  record("3 the same code cannot be reused", reused.status === 404);

  const approveAsFreelancer = await api(`/vaults/${vaultId}/approve`, { method: "POST", token: freelancer });
  record("9d wrong user cannot approve", approveAsFreelancer.status === 403, codeOf(approveAsFreelancer));

  const approveWrongState = await api(`/vaults/${vaultId}/approve`, { method: "POST", token: client, body: { amount: 1 } });
  record("9e/9f approve outside AWAITING_APPROVAL is 409 and ignores body amount", approveWrongState.status === 409, codeOf(approveWrongState));

  const files = await api(`/uploads/vault/${vaultId}/files`, { token: client });
  const fileId = files.json?.data?.[0]?.id;
  const locked = await api(`/vaults/${vaultId}/files/${fileId}/download`, { token: client });
  record("5 locked download is 403 before PAID", locked.status === 403, codeOf(locked));

  const unsigned = await api("/webhooks/paypal", {
    method: "POST",
    body: { id: `evt-${Date.now()}`, event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { custom_id: vaultId } },
  });
  record("9c unsigned webhook is 400", unsigned.status === 400);

  console.log(`\n${pass} passed, ${fail} failed.`);
  console.log("MANUAL: step 4 (PayPal approval page), 6 (capture + unlock after approval), 7 (payout in the freelancer sandbox balance), 9b (fallback when the webhook is unregistered).");
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(`checker crashed: ${err?.message || err}`);
  process.exit(1);
});
