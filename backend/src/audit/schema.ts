/**
 * schema.ts — idempotent DDL for the audit conversation.
 *
 * The room keeps a record of what the client asked and what the audit agent
 * answered, so leaving the room and coming back does not erase it. Created once
 * at boot through DATABASE_URL; a no-op without it (tests, in-memory mode).
 */
import { Pool } from "pg";
import { logger } from "../shared/logger.js";

const STATEMENTS = [
  `create table if not exists audit_messages (
     id text primary key,
     vault_id text not null,
     user_id text,
     role text not null check (role in ('user', 'ai')),
     text text not null,
     sources jsonb not null default '[]'::jsonb,
     cached boolean not null default false,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists audit_messages_vault_idx on audit_messages (vault_id, created_at)`,
  /* the browser key must not read a private conversation; the API uses the
     service role, which bypasses RLS. No policy is added on purpose. */
  `alter table audit_messages enable row level security`,
];

export async function ensureAuditSchema(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.warn("[schema] DATABASE_URL is not set; skipping audit-message DDL");
    return false;
  }

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
  try {
    for (const statement of STATEMENTS) {
      await pool.query(statement);
    }
    logger.info("[schema] audit-message schema is up to date");
    return true;
  } catch (err: any) {
    logger.error(`[schema] audit-message DDL failed: ${err?.message || "unknown error"}`);
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}
