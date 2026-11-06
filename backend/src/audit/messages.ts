/**
 * messages.ts — the audit room's conversation, stored so it outlives the tab.
 *
 * Supabase is the system of record when configured; the in-memory map keeps the
 * unit tests on the same code path. A failed write never costs the client the
 * answer that was just generated: it is logged and the conversation continues.
 */
import crypto from "crypto";
import { database, type DbAuditMessageRecord } from "../shared/db.js";
import { isSupabaseConfigured, supabase } from "../shared/supabaseClient.js";
import { logger } from "../shared/logger.js";

const TABLE = "audit_messages";
const HISTORY_LIMIT = 200;

export interface AuditMessage {
  id: string;
  role: "ai" | "user";
  text: string;
  sources: string[];
  cached: boolean;
  createdAt: string;
}

export interface NewAuditMessage {
  userId: string | null;
  role: "ai" | "user";
  text: string;
  sources: string[];
  cached: boolean;
}

function toMessage(row: any): AuditMessage {
  return {
    id: String(row.id),
    role: row.role === "user" ? "user" : "ai",
    text: String(row.text ?? ""),
    sources: Array.isArray(row.sources) ? row.sources.map(String) : [],
    cached: Boolean(row.cached),
    createdAt: new Date(row.created_at || Date.now()).toISOString(),
  };
}

/** Oldest first: the room reads top to bottom, like it did live. */
export async function listAuditMessages(vaultId: string): Promise<AuditMessage[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, role, text, sources, cached, created_at")
      .eq("vault_id", vaultId)
      .order("created_at", { ascending: true })
      .limit(HISTORY_LIMIT);

    if (error) {
      logger.warn(`[audit] could not read the conversation for ${vaultId}: ${error.message}`);
      return [];
    }

    return (data || []).map(toMessage);
  }

  return Array.from(database.store.auditMessages.values())
    .filter((row) => row.vault_id === vaultId)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
    .slice(0, HISTORY_LIMIT)
    .map((row) => toMessage({ ...row, created_at: row.created_at.toISOString() }));
}

/**
 * Append one or more turns in a single insert. Timestamps are staggered by a
 * millisecond so the question always sorts before its answer.
 */
export async function appendAuditMessages(
  vaultId: string,
  messages: NewAuditMessage[]
): Promise<void> {
  if (!messages.length) return;

  const base = Date.now();
  const rows: DbAuditMessageRecord[] = messages.map((message, index) => ({
    id: crypto.randomUUID(),
    vault_id: vaultId,
    user_id: message.userId,
    role: message.role,
    text: message.text,
    sources: message.sources,
    cached: message.cached,
    created_at: new Date(base + index),
  }));

  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from(TABLE).insert(
      rows.map((row) => ({
        id: row.id,
        vault_id: row.vault_id,
        user_id: row.user_id,
        role: row.role,
        text: row.text,
        sources: row.sources,
        cached: row.cached,
        created_at: row.created_at.toISOString(),
      }))
    );

    if (error) {
      logger.warn(`[audit] could not save the conversation for ${vaultId}: ${error.message}`);
    }
    return;
  }

  for (const row of rows) {
    database.store.auditMessages.set(row.id, row);
  }
}
