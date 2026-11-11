/* gen-api-docs.mjs — one route table, two artifacts.

   The table below mirrors what backend/src/app.ts mounts. Both docs/openapi.json
   and the Postman collection are generated from it so a route that changes keeps
   its contract and its example in step. Run with `npm run gen:docs`.

   Bodies are shapes, not authority: every body is validated by the zod schema in
   the route file, which is where a judge should look for required fields. */

import fs from "node:fs";
import path from "node:path";

const SERVER = "https://vaultlance-ai.fly.dev/api";
const LOCAL = "http://localhost:3000/api";

/** @typedef {{method:string,path:string,tag:string,summary:string,public?:boolean,param?:string[],query?:string[],body?:Record<string,unknown>,status?:number}} Route */

/** @type {Route[]} */
const routes = [
  { method: "post", path: "/auth/register", tag: "Auth", summary: "Register a freelancer or client", public: true, status: 201, body: { email: "freelancer@example.com", password: "CorrectHorse9!", fullName: "Ada Lovelace", role: "FREELANCER" } },
  { method: "post", path: "/auth/login", tag: "Auth", summary: "Sign in and receive a bearer token", public: true, body: { email: "freelancer@example.com", password: "CorrectHorse9!" } },
  { method: "post", path: "/auth/logout", tag: "Auth", summary: "Revoke the current session" },
  { method: "post", path: "/auth/password-reset/request", tag: "Auth", summary: "Ask for a reset code (same answer for every address)", public: true, body: { email: "freelancer@example.com" } },
  { method: "get", path: "/auth/password-reset/{token}", tag: "Auth", summary: "Inspect a reset code", public: true, param: ["token"] },
  { method: "post", path: "/auth/password-reset/confirm", tag: "Auth", summary: "Set a new password with a reset code", public: true, body: { token: "a1b2c3", password: "AnotherPass9!" } },
  { method: "get", path: "/auth/me", tag: "Auth", summary: "Current profile" },
  { method: "patch", path: "/auth/me", tag: "Auth", summary: "Update the current profile", body: { fullName: "Ada L." } },
  { method: "post", path: "/auth/me/password", tag: "Auth", summary: "Change the password", body: { currentPassword: "CorrectHorse9!", newPassword: "AnotherPass9!" } },
  { method: "get", path: "/auth/me/export", tag: "Auth", summary: "Export the account's own data" },
  { method: "get", path: "/auth/me/payout-profile", tag: "Auth", summary: "Read the freelancer payout profile" },
  { method: "put", path: "/auth/me/payout-profile", tag: "Auth", summary: "Save the freelancer payout profile", body: { payoutEmail: "freelancer@example.com" } },
  { method: "delete", path: "/auth/me", tag: "Auth", summary: "Delete the account", body: { password: "CorrectHorse9!" } },

  { method: "get", path: "/vaults", tag: "Vaults", summary: "List vaults the caller belongs to" },
  { method: "post", path: "/vaults", tag: "Vaults", summary: "Create a vault (freelancer only)", status: 201, body: { title: "Landing page rebuild", amount: 250, currency: "USD", clientEmail: "client@example.com" } },
  { method: "get", path: "/vaults/{id}", tag: "Vaults", summary: "Read one vault (participants only)", param: ["id"] },
  { method: "patch", path: "/vaults/{id}", tag: "Vaults", summary: "Update a vault (freelancer owner)", param: ["id"], body: { title: "Landing page rebuild v2", amount: 300 } },
  { method: "post", path: "/vaults/{id}/invite", tag: "Vaults", summary: "Invite the client by email", param: ["id"], body: { clientEmail: "client@example.com" } },
  { method: "post", path: "/vaults/{id}/accept", tag: "Vaults", summary: "Accept an invitation (client only)", param: ["id"] },
  { method: "post", path: "/vaults/{id}/submit", tag: "Vaults", summary: "Submit the delivery and lock the manifest", param: ["id"] },
  { method: "post", path: "/vaults/{id}/authorize", tag: "Vaults", summary: "Move the vault to AWAITING_AUTHORIZATION", param: ["id"] },
  { method: "post", path: "/vaults/{id}/approve", tag: "Vaults", summary: "Client approves; capture runs server-side", param: ["id"] },
  { method: "post", path: "/vaults/{id}/revision", tag: "Vaults", summary: "Client requests a revision", param: ["id"], body: { note: "Please fix the footer links." } },
  { method: "post", path: "/vaults/{id}/reject", tag: "Vaults", summary: "Client rejects; the hold is voided", param: ["id"], body: { reason: "Not the agreed scope." } },
  { method: "post", path: "/vaults/{id}/audit", tag: "Audit", summary: "Run the grounded audit", param: ["id"] },
  { method: "get", path: "/vaults/{id}/audit-detail", tag: "Audit", summary: "Read checks, findings and usage", param: ["id"] },
  { method: "post", path: "/vaults/{id}/checks/run", tag: "Audit", summary: "Run the deterministic checks", param: ["id"] },
  { method: "post", path: "/vaults/{id}/chat", tag: "Audit", summary: "Ask the audit assistant about this vault", param: ["id"], body: { message: "Which checks failed?" } },

  { method: "post", path: "/vaults/{id}/invite-code", tag: "Invites", summary: "Mint a join code for the client", param: ["id"] },
  { method: "post", path: "/vaults/join", tag: "Invites", summary: "Join a vault with a code", body: { code: "VL-8F2K" } },
  { method: "post", path: "/vaults/{id}/join", tag: "Invites", summary: "Join a specific vault with a code", param: ["id"], body: { code: "VL-8F2K" } },

  { method: "post", path: "/vaults/{vaultId}/payment/order", tag: "Payments", summary: "Create a PayPal sandbox authorization order", status: 201, param: ["vaultId"], body: { returnUrl: "https://vault-lance-ai.vercel.app/vault/{id}", cancelUrl: "https://vault-lance-ai.vercel.app/dashboard" } },
  { method: "post", path: "/vaults/{vaultId}/payment/authorize", tag: "Payments", summary: "Authorize the buyer-approved order", param: ["vaultId"], body: { orderId: "ORDER-1" } },
  { method: "post", path: "/vaults/{vaultId}/payment/reconcile", tag: "Payments", summary: "Claim a hold PayPal already has", param: ["vaultId"], body: { orderId: "ORDER-1" } },
  { method: "post", path: "/vaults/{id}/capture", tag: "Payments", summary: "Capture and unlock (client approval)", param: ["id"] },
  { method: "post", path: "/vaults/{id}/void", tag: "Payments", summary: "Void the authorization and release the hold", param: ["id"], body: { authorizationId: "AUTH-1" } },
  { method: "get", path: "/vaults/{id}/payout", tag: "Payments", summary: "Payout state for a vault", param: ["id"] },
  { method: "post", path: "/vaults/{id}/payout/retry", tag: "Payments", summary: "Retry a failed payout", param: ["id"] },

  { method: "post", path: "/uploads/{vaultId}", tag: "Files", summary: "Upload a deliverable (multipart, freelancer)", status: 201, param: ["vaultId"] },
  { method: "get", path: "/uploads/download/{fileId}", tag: "Files", summary: "Download a file the caller may read", param: ["fileId"] },
  { method: "get", path: "/uploads/vault/{vaultId}/files", tag: "Files", summary: "List a vault's files", param: ["vaultId"] },
  { method: "get", path: "/vaults/{id}/files/{fileId}/download", tag: "Files", summary: "Signed download for a PAID vault", param: ["id", "fileId"] },

  { method: "get", path: "/manifests/{vaultId}", tag: "Manifests", summary: "Read the canonical manifest", param: ["vaultId"] },
  { method: "post", path: "/manifests/{vaultId}/verify", tag: "Manifests", summary: "Recompute SHA-256 and compare", param: ["vaultId"], body: { manifest: {} } },

  { method: "get", path: "/ledger", tag: "Ledger", summary: "Ledger events for every readable vault" },

  { method: "post", path: "/playground/start", tag: "Playground", summary: "Start a sandbox vault (no money)", public: true },
  { method: "post", path: "/playground/sample", tag: "Playground", summary: "Add a sample file", body: { kind: "zip" } },
  { method: "post", path: "/playground/reset", tag: "Playground", summary: "Reset the playground vault" },

  { method: "get", path: "/ai/health", tag: "Service", summary: "Diagnostic for the private AI service" },
  { method: "post", path: "/webhooks/paypal", tag: "Service", summary: "PayPal webhook (raw body, signature checked)", public: true }
];

const security = [{ bearerAuth: [] }];

function params(route) {
  return (route.param || []).map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function bodySchema(route) {
  if (!route.body) return undefined;
  const properties = {};
  const required = [];
  for (const [key, value] of Object.entries(route.body)) {
    const type = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string";
    properties[key] = { type, example: value };
    required.push(key);
  }
  return {
    required: true,
    content: {
      "application/json": {
        schema: { type: "object", properties, required },
        example: route.body,
      },
    },
  };
}

const openapi = {
  openapi: "3.0.3",
  info: {
    title: "VaultLance AI API",
    version: "1.0.0",
    description:
      "Express service that owns vault state and money. All routes except auth entry points, the playground start and the PayPal webhook require `Authorization: Bearer <token>`. PayPal calls are pinned to the sandbox.",
  },
  servers: [{ url: SERVER, description: "Fly (production)" }, { url: LOCAL, description: "Local" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Envelope: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" },
          data: {},
        },
      },
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          error: { type: "object", properties: { code: { type: "string" } } },
        },
      },
    },
  },
  security,
  paths: {},
};

for (const route of routes) {
  openapi.paths[route.path] ||= {};
  const responses = {
    [route.status || 200]: {
      description: "Success",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
    },
    "400": { description: "Validation or state error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    "401": { description: "Missing or expired token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    "403": { description: "Not a participant or wrong role", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    "409": { description: "Conflict (state or amount)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  };
  openapi.paths[route.path][route.method] = {
    tags: [route.tag],
    summary: route.summary,
    ...(route.public ? { security: [] } : {}),
    ...(route.param ? { parameters: params(route) } : {}),
    ...(route.body ? { requestBody: bodySchema(route) } : {}),
    responses,
  };
}

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/openapi.json", JSON.stringify(openapi, null, 2) + "\n");

/* ── Postman ─────────────────────────────────────────────────────────────── */

const varFor = (name) =>
  ({ id: "vaultId", vaultId: "vaultId", fileId: "fileId", token: "resetToken", orderId: "orderId" }[name] || name);
const pmPath = (route) => route.path.replace(/\{(\w+)\}/g, (_, name) => `{{${varFor(name)}}}`);

const folders = new Map();
for (const route of routes) {
  const url = `{{baseUrl}}${pmPath(route)}`;
  const item = {
    name: `${route.method.toUpperCase()} ${route.path}`,
    request: {
      method: route.method.toUpperCase(),
      header: route.body ? [{ key: "Content-Type", value: "application/json" }] : [],
      ...(route.public ? { auth: { type: "noauth" } } : {}),
      ...(route.body ? { body: { mode: "raw", raw: JSON.stringify(route.body, null, 2), options: { raw: { language: "json" } } } } : {}),
      url: {
        raw: url,
        host: ["{{baseUrl}}"],
        path: pmPath(route).replace(/^\//, "").split("/"),
      },
    },
    event: [],
  };

  /* capture the ids a later request needs, so the folder runs top to bottom */
  const capture = [];
  if (route.path === "/auth/login" || route.path === "/auth/register") {
    capture.push('const body = pm.response.json(); if (body?.data?.token) pm.collectionVariables.set("token", body.data.token);');
  }
  if (route.method === "post" && route.path === "/vaults") {
    capture.push('const body = pm.response.json(); if (body?.data?.id) pm.collectionVariables.set("vaultId", body.data.id);');
  }
  if (route.path.endsWith("/payment/order")) {
    capture.push('const body = pm.response.json(); if (body?.data?.orderId) pm.collectionVariables.set("orderId", body.data.orderId);');
    capture.push('const link = (pm.response.json()?.data?.links || []).find((l) => l.rel === "approve" || l.rel === "payer-action"); if (link) pm.collectionVariables.set("approveUrl", link.href);');
  }
  if (capture.length) {
    item.event.push({
      listen: "test",
      script: { type: "text/javascript", exec: capture },
    });
  }

  if (!folders.has(route.tag)) folders.set(route.tag, []);
  folders.get(route.tag).push(item);
}

const collection = {
  info: {
    name: "VaultLance API (real routes)",
    description:
      "Generated from scripts/gen-api-docs.mjs. Covers the Express surface: auth, vaults, the money loop (PayPal sandbox order → authorize → capture/void), files, manifests, audit, ledger and playground. Set baseUrl and run Auth → Register/Login first; the collection captures the token and ids.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] },
  item: [...folders.entries()].map(([name, items]) => ({ name, item: items })),
  variable: [
    { key: "baseUrl", value: LOCAL },
    { key: "token", value: "" },
    { key: "vaultId", value: "" },
    { key: "fileId", value: "" },
    { key: "orderId", value: "" },
    { key: "approveUrl", value: "" },
    { key: "resetToken", value: "" },
  ],
};

fs.mkdirSync("postman", { recursive: true });
fs.writeFileSync("postman/VaultLance API.postman_collection.json", JSON.stringify(collection, null, 2) + "\n");

/* The environment export carries names, never values: a shared collection is
   imported by judges who paste their own sandbox credentials. */
const environment = {
  id: "b4e6b6d0-9f04-4a52-8a16-2f2f1c4d3e11",
  name: "VaultLance API",
  values: [
    { key: "baseUrl", value: LOCAL, type: "default", enabled: true },
    { key: "token", value: "", type: "default", enabled: true },
    { key: "vaultId", value: "", type: "default", enabled: true },
    { key: "fileId", value: "", type: "default", enabled: true },
    { key: "orderId", value: "", type: "default", enabled: true },
    { key: "approveUrl", value: "", type: "default", enabled: true },
    { key: "resetToken", value: "", type: "default", enabled: true },
  ],
  _postman_variable_scope: "environment",
  _postman_exported_using: "scripts/gen-api-docs.mjs",
};
fs.writeFileSync("postman/VaultLance API.postman_environment.json", JSON.stringify(environment, null, 2) + "\n");

console.log(`openapi: ${Object.keys(openapi.paths).length} paths`);
console.log(`postman: ${routes.length} requests in ${folders.size} folders`);
