#!/usr/bin/env node
/**
 * backfill-paypal-ids.mjs — fill empty paypal_* columns from ledger metadata.
 *
 * Dry run by default: prints one row per vault and the value that would be
 * written. Nothing is changed until --apply is passed. It reads credentials from
 * backend/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and never prints them.
 *
 *   node scripts/backfill-paypal-ids.mjs
 *   node scripts/backfill-paypal-ids.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    out[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnv(path.join("backend", ".env"));
const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env");
  process.exit(1);
}
if (/anon/i.test(key) || key.length < 100) {
  console.error("Refusing to run: this needs the service role key, not a publishable key.");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function get(table, query) {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return res.json();
}

const vaults = await get(
  "vaults",
  "select=id,paypal_order_id,paypal_authorization_id,paypal_capture_id&order=created_at.asc"
);
const events = await get(
  "ledger_events",
  "select=vault_id,event_type,metadata,created_at&order=created_at.desc&limit=5000"
);

/* newest event wins per vault and field */
const fromLedger = new Map();
for (const row of events) {
  const meta = row.metadata || {};
  const slot = fromLedger.get(row.vault_id) || {};
  if (!slot.orderId && typeof meta.orderId === "string") slot.orderId = meta.orderId;
  if (!slot.authorizationId && typeof meta.authorizationId === "string") slot.authorizationId = meta.authorizationId;
  if (!slot.captureId && typeof meta.captureId === "string") slot.captureId = meta.captureId;
  fromLedger.set(row.vault_id, slot);
}

const changes = [];
for (const vault of vaults) {
  const ledger = fromLedger.get(vault.id) || {};
  const patch = {};
  if (!vault.paypal_order_id && ledger.orderId) patch.paypal_order_id = ledger.orderId;
  if (!vault.paypal_authorization_id && ledger.authorizationId)
    patch.paypal_authorization_id = ledger.authorizationId;
  if (!vault.paypal_capture_id && ledger.captureId) patch.paypal_capture_id = ledger.captureId;
  if (Object.keys(patch).length) changes.push({ id: vault.id, patch });
}

if (!changes.length) {
  console.log("Nothing to backfill: every vault already has its ids, or the ledger has none.");
  process.exit(0);
}

console.log(`${changes.length} vault(s) would change${APPLY ? "" : " (dry run)"}:`);
for (const change of changes) {
  console.log(`  ${change.id}  ${Object.entries(change.patch).map(([k, v]) => `${k}=${v}`).join("  ")}`);
}

if (!APPLY) {
  console.log("\nNothing was written. Re-run with --apply to write these values.");
  process.exit(0);
}

let written = 0;
for (const change of changes) {
  const res = await fetch(`${url}/rest/v1/vaults?id=eq.${encodeURIComponent(change.id)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(change.patch),
  });
  if (!res.ok) {
    console.error(`  failed ${change.id}: HTTP ${res.status}`);
    continue;
  }
  written += 1;
}
console.log(`\nApplied ${written}/${changes.length}.`);
