import crypto from "crypto";
import { database, type DbSessionRecord } from "../shared/db.js";
import { config } from "../shared/config.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { DatabaseError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

/**
 * Auth sessions.
 *
 * Supabase's `auth_sessions` table is the system of record whenever Supabase is
 * configured, so a session made on one Fly machine is visible to the other and
 * survives a restart. The in-memory map is the fallback for tests and for
 * USE_IN_MEMORY_DB, where there is no second process to share with.
 *
 * A failed read throws instead of returning null on purpose: null means "this
 * session is revoked or expired" and the route answers 401, which makes the
 * frontend sign the user out. A database hiccup must not look like a logout.
 */
export interface SessionData {
  sessionId: string;
  userId: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  revoked: boolean;
  ipAddress?: string;
  userAgent?: string;
}

const TABLE = "auth_sessions";

function liveClient() {
  return isSupabaseConfigured() && supabase ? supabase : null;
}

function toSession(row: any): SessionData {
  return {
    sessionId: String(row.id),
    userId: String(row.user_id),
    token: String(row.token),
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    revoked: Boolean(row.revoked),
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
  };
}

function toMemory(record: DbSessionRecord): SessionData {
  return {
    sessionId: record.id,
    userId: record.user_id,
    token: record.token,
    createdAt: record.created_at,
    expiresAt: record.expires_at,
    revoked: record.revoked,
    ipAddress: record.ip_address,
    userAgent: record.user_agent,
  };
}

export class SessionStore {
  public async createSession(
    userId: string,
    token: string,
    ipAddress?: string,
    userAgent?: string,
    providedSessionId?: string
  ): Promise<SessionData> {
    database.store.checkFailure();
    const sessionId = providedSessionId || crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.session.ttlSeconds * 1000);

    const record: DbSessionRecord = {
      id: sessionId,
      user_id: userId,
      token,
      created_at: now,
      expires_at: expiresAt,
      revoked: false,
      ip_address: ipAddress,
      user_agent: userAgent,
    };

    const db = liveClient();

    if (db) {
      const { error } = await db.from(TABLE).insert([
        {
          id: record.id,
          user_id: record.user_id,
          token: record.token,
          created_at: record.created_at.toISOString(),
          expires_at: record.expires_at.toISOString(),
          revoked: false,
          ip_address: record.ip_address ?? null,
          user_agent: record.user_agent ?? null,
        },
      ]);

      if (error) {
        logger.error(`[session] could not persist session ${sessionId}: ${error.message}`);
        throw new DatabaseError("Could not start a session. Try again.", {
          session: sessionId,
        });
      }

      return toMemory(record);
    }

    database.store.sessions.set(sessionId, record);
    return toMemory(record);
  }

  public async getSession(sessionId: string): Promise<SessionData | null> {
    database.store.checkFailure();
    const db = liveClient();

    if (db) {
      const { data, error } = await db
        .from(TABLE)
        .select("id, user_id, token, created_at, expires_at, revoked, ip_address, user_agent")
        .eq("id", sessionId)
        .maybeSingle();

      if (error) {
        logger.error(`[session] could not read session ${sessionId}: ${error.message}`);
        throw new DatabaseError("Could not verify the session. Try again.");
      }

      /* getSession treats revoked and expired rows as absent; the caller turns
         null into SESSION_REVOKED. */
      if (!data || data.revoked) return null;

      const session = toSession(data);
      if (Number.isNaN(session.expiresAt.getTime())) return null;
      if (new Date() > session.expiresAt) return null;

      return session;
    }

    const record = database.store.sessions.get(sessionId);
    if (!record) return null;

    // Check expiration
    if (new Date() > record.expires_at || record.revoked) {
      return null;
    }

    return toMemory(record);
  }

  public async revokeSession(sessionId: string): Promise<boolean> {
    database.store.checkFailure();
    const db = liveClient();

    if (db) {
      const { data, error } = await db
        .from(TABLE)
        .update({ revoked: true })
        .eq("id", sessionId)
        .select("id");

      if (error) {
        logger.error(`[session] could not revoke session ${sessionId}: ${error.message}`);
        throw new DatabaseError("Could not end the session. Try again.");
      }

      return Array.isArray(data) && data.length > 0;
    }

    const record = database.store.sessions.get(sessionId);
    if (!record) return false;
    record.revoked = true;
    return true;
  }

  /** Revoke every session for a user except the one making the request. */
  public async revokeAllExcept(userId: string, keepSessionId?: string): Promise<number> {
    database.store.checkFailure();
    const db = liveClient();

    if (db) {
      let query = db
        .from(TABLE)
        .update({ revoked: true })
        .eq("user_id", userId)
        .eq("revoked", false);
      if (keepSessionId) query = query.neq("id", keepSessionId);

      const { data, error } = await query.select("id");
      if (error) {
        logger.error(`[session] could not revoke other sessions for ${userId}: ${error.message}`);
        throw new DatabaseError("Could not revoke the other sessions. Try again.");
      }

      return Array.isArray(data) ? data.length : 0;
    }

    let revoked = 0;
    for (const record of database.store.sessions.values()) {
      if (record.user_id === userId && record.id !== keepSessionId && !record.revoked) {
        record.revoked = true;
        revoked++;
      }
    }
    return revoked;
  }

  public async revokeAllForUser(userId: string): Promise<void> {
    database.store.checkFailure();
    const db = liveClient();

    if (db) {
      const { error } = await db
        .from(TABLE)
        .update({ revoked: true })
        .eq("user_id", userId)
        .select("id");

      if (error) {
        logger.error(`[session] could not revoke sessions for ${userId}: ${error.message}`);
        throw new DatabaseError("Could not revoke the sessions. Try again.");
      }

      return;
    }

    for (const record of database.store.sessions.values()) {
      if (record.user_id === userId) {
        record.revoked = true;
      }
    }
  }

  public async pruneExpired(): Promise<number> {
    const db = liveClient();

    if (db) {
      /* two deletes instead of an OR filter: an ISO timestamp inside PostgREST's
         or=() syntax has to be quoted, and a mismatch here would delete nothing
         while looking like it worked */
      const expired = await db
        .from(TABLE)
        .delete()
        .lt("expires_at", new Date().toISOString())
        .select("id");

      if (expired.error) {
        logger.error(`[session] could not prune expired sessions: ${expired.error.message}`);
        throw new DatabaseError("Could not prune sessions. Try again.");
      }

      const revoked = await db.from(TABLE).delete().eq("revoked", true).select("id");

      if (revoked.error) {
        logger.error(`[session] could not prune revoked sessions: ${revoked.error.message}`);
        throw new DatabaseError("Could not prune sessions. Try again.");
      }

      return (expired.data?.length ?? 0) + (revoked.data?.length ?? 0);
    }

    const now = new Date();
    let count = 0;
    for (const [id, record] of database.store.sessions.entries()) {
      if (now > record.expires_at || record.revoked) {
        database.store.sessions.delete(id);
        count++;
      }
    }
    return count;
  }
}

export const sessionStore = new SessionStore();
