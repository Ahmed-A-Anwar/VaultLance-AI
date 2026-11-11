import crypto from "crypto";
import { database, type DbSessionRecord } from "../shared/db.js";
import { config } from "../shared/config.js";

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

    database.store.sessions.set(sessionId, record);

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

  public async getSession(sessionId: string): Promise<SessionData | null> {
    database.store.checkFailure();
    const record = database.store.sessions.get(sessionId);
    if (!record) return null;

    // Check expiration
    if (new Date() > record.expires_at || record.revoked) {
      return null;
    }

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

  public async revokeSession(sessionId: string): Promise<boolean> {
    database.store.checkFailure();
    const record = database.store.sessions.get(sessionId);
    if (!record) return false;
    record.revoked = true;
    return true;
  }

  public async revokeAllForUser(userId: string): Promise<void> {
    database.store.checkFailure();
    for (const record of database.store.sessions.values()) {
      if (record.user_id === userId) {
        record.revoked = true;
      }
    }
  }

  public async pruneExpired(): Promise<number> {
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
