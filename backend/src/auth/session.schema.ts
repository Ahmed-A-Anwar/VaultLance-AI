/**
 * session.schema.ts — idempotent DDL for durable auth sessions.
 *
 * Sessions used to live only in the process heap, so a login was lost whenever
 * Fly moved traffic to the other machine or restarted one. This table is the
 * system of record; it is created once at boot through DATABASE_URL and the DDL
 * is safe to run on every deploy. Without DATABASE_URL (tests, in-memory mode)
 * it is a no-op and the session store keeps its in-memory map.
 *
 * ids are text, not uuid: the store accepts a caller-provided session id and
 * the in-memory fallback uses plain strings.
 */
import { Pool } from "pg";
import { logger } from "../shared/logger.js";

const STATEMENTS = [
  `create table if not exists auth_sessions (
     id text primary key,
     user_id text not null,
     token text not null,
     created_at timestamptz not null default now(),
     expires_at timestamptz not null,
     revoked boolean not null default false,
     ip_address text,
     user_agent text
   )`,
  `create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id)`,
  `create index if not exists auth_sessions_expires_at_idx on auth_sessions (expires_at)`,
  /* the browser key must never be able to read session tokens; the API uses
     the service role, which bypasses RLS. No policy is added on purpose. */
  `alter table auth_sessions enable row level security`,
];

export async function ensureSessionSchema(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.warn("[schema] DATABASE_URL is not set; skipping auth-session DDL");
    return false;
  }

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
  try {
    for (const statement of STATEMENTS) {
      await pool.query(statement);
    }
    logger.info("[schema] auth-session schema is up to date");
    return true;
  } catch (err: any) {
    /* Never break a boot over DDL; the session store reports the real failure
       when it is used. The message carries no credentials. */
    logger.error(`[schema] auth-session DDL failed: ${err?.message || "unknown error"}`);
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}
