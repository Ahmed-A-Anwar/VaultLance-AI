/**
 * schema.ts — idempotent DDL for the money loop.
 *
 * The repo has no migration runner and Supabase owns the schema, so this runs
 * once at boot through DATABASE_URL and is safe to run on every deploy. When
 * DATABASE_URL is absent (tests, in-memory mode) it is a no-op: the services
 * fall back to their in-memory store.
 */
import { Pool } from "pg";
import { logger } from "../shared/logger.js";

const STATEMENTS = [
  `create table if not exists paypal_events (
     id uuid primary key default gen_random_uuid(),
     paypal_event_id text not null unique,
     event_type text not null,
     vault_id text,
     processing_status text not null default 'RECEIVED',
     payload jsonb,
     received_at timestamptz not null default now(),
     processed_at timestamptz
   )`,
  `create table if not exists vault_captures (
     vault_id text primary key,
     capture_id text not null,
     status text not null,
     gross_cents bigint not null,
     paypal_fee_cents bigint not null,
     net_cents bigint not null,
     payout_cents bigint not null,
     confirmed_via text not null,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists vault_payouts (
     id uuid primary key default gen_random_uuid(),
     vault_id text not null unique,
     status text not null default 'none',
     amount_cents bigint not null default 0,
     currency text not null default 'USD',
     sender_batch_id text not null unique,
     payout_item_id text,
     reason text,
     attempt integer not null default 1,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists vault_invites (
     id uuid primary key default gen_random_uuid(),
     vault_id text not null,
     code text not null unique,
     created_by text not null,
     expires_at timestamptz not null,
     used_by text,
     used_at timestamptz,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists vault_manifests (
     vault_id text primary key,
     manifest_sha256 text not null,
     file_count integer not null,
     total_size_bytes bigint not null,
     canonical_json text not null,
     locked_at timestamptz not null default now(),
     locked_by text not null
   )`,
  `alter table vaults add column if not exists paypal_order_id text`,
  `alter table vaults add column if not exists paypal_authorization_id text`,
  `alter table vaults add column if not exists paypal_capture_id text`,
  `alter table vaults add column if not exists questions_used integer not null default 0`,
  `alter table users add column if not exists paypal_payout_email text`,
  `alter table vault_files add column if not exists unlocked boolean not null default false`,
];

export async function ensureMoneySchema(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.warn("[schema] DATABASE_URL is not set; skipping money-loop DDL");
    return false;
  }

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
  try {
    for (const statement of STATEMENTS) {
      await pool.query(statement);
    }
    logger.info("[schema] money-loop schema is up to date");
    return true;
  } catch (err: any) {
    /* Never break a boot over DDL: the endpoints report the real failure when
       they are used. The message carries no credentials. */
    logger.error(`[schema] DDL failed: ${err?.message || "unknown error"}`);
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}
