import { Pool } from "pg";
import { logger } from "../shared/logger.js";

export interface VaultListData {
  vaults: any[];
  captures: any[];
}

/*
 * One round trip for the whole dashboard list. The raw rows keep the same
 * nested shape PostgREST returns, so the DTO mapping above stays the single
 * place that decides what a receipt and a member look like.
 */
const LIST_SQL = `
  with target as (select $1::uuid as user_id),
  accessible as materialized (
    select v.* from vaults v join target t on v.freelancer_id = t.user_id
    union
    select v.* from vaults v join vault_members m on m.vault_id = v.id join target t on m.user_id = t.user_id
  ),
  members as (
    select m.vault_id,
           jsonb_agg(to_jsonb(m) || jsonb_build_object('users', to_jsonb(u))) as rows
    from vault_members m
    left join users u on u.id = m.user_id
    where m.vault_id in (select id from accessible)
    group by m.vault_id
  ),
  files as (
    select f.vault_id, jsonb_agg(to_jsonb(f)) as rows
    from vault_files f
    where f.vault_id in (select id from accessible)
    group by f.vault_id
  ),
  events as (
    select e.vault_id,
           jsonb_agg(jsonb_build_object(
             'vault_id', e.vault_id,
             'metadata', e.metadata,
             'created_at', e.created_at
           )) as rows
    from ledger_events e
    where e.vault_id in (select id from accessible)
    group by e.vault_id
  )
  select
    coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object(
      'vault_members', coalesce(m.rows, '[]'::jsonb),
      'vault_files', coalesce(f.rows, '[]'::jsonb),
      'ledger_events', coalesce(ev.rows, '[]'::jsonb)
    )), '[]'::jsonb) as vaults,
    (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
     from vault_captures c
     where c.vault_id in (select id::text from accessible)) as captures
  from accessible a
  left join members m on m.vault_id = a.id
  left join files f on f.vault_id = a.id
  left join events ev on ev.vault_id = a.id
`;

interface DbPool {
  query(text: string, values: unknown[]): Promise<{ rows: Array<Record<string, any>> }>;
  on(event: "error", listener: (error: Error) => void): void;
}

let pool: DbPool | null = null;
let lastFailureLog = 0;

function getPool(): DbPool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (!pool) {
    const PoolCtor = Pool as unknown as new (config: Record<string, unknown>) => DbPool;
    pool = new PoolCtor({
      connectionString,
      max: 2,
      idleTimeoutMillis: 300_000,
      connectionTimeoutMillis: 3_000,
      statement_timeout: 5_000,
      /* Supabase requires TLS. Respect an explicit sslmode; otherwise use TLS
         without relying on the pooler's certificate chain. */
      ssl: /[?&]sslmode=/.test(connectionString)
        ? undefined
        : { rejectUnauthorized: false },
    });
    pool.on("error", (error: Error) => {
      logger.warn(`[vaults] direct database connection error: ${error.message}`);
    });
  }

  return pool;
}

/** Open the pool while the process is starting so the first dashboard read
    does not pay the TLS/connection setup as well as the query. */
export function warmVaultListPool(): void {
  const db = getPool();
  if (!db) return;
  void db.query("select 1", []).catch(() => {});
}

/**
 * Read the list directly when DATABASE_URL is available. A failure returns
 * null so the caller can use the PostgREST path; it never exposes a partial
 * list or a database error to the browser.
 */
export async function readVaultList(userId: string): Promise<VaultListData | null> {
  const db = getPool();
  if (!db) return null;

  try {
    const result = await db.query(LIST_SQL, [userId]);
    const row = result.rows[0];
    if (!row || !Array.isArray(row.vaults) || !Array.isArray(row.captures)) {
      return null;
    }
    return { vaults: row.vaults, captures: row.captures };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "UNKNOWN";
    const now = Date.now();
    if (now - lastFailureLog > 60_000) {
      lastFailureLog = now;
      /* Never log the connection string or the user id. */
      logger.warn(`[vaults] direct list query failed (${code}); using PostgREST`);
    }
    return null;
  }
}
