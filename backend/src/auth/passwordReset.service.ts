/* passwordReset.service.ts — reset links that expire, burn once, and never say
   whether an address has an account.

   Two transports, because the deployment has two:
   - Supabase configured (production): Supabase mails its own recovery link and
     the confirm call takes the access token from that link's fragment.
   - In-memory (local, no Supabase): this service mints a 32-byte token, keeps
     only its sha256, logs the link and — outside production — returns it so a
     developer or a test can finish the flow. */

import crypto from "crypto";
import { database } from "../shared/db.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { hashPassword } from "./password.js";
import { sessionStore } from "./session.store.js";
import { config } from "../shared/config.js";
import { logger } from "../shared/logger.js";
import { BadRequestError, DatabaseError } from "../shared/errors.js";

export const RESET_TTL_MS = 30 * 60 * 1000;

export type ResetTokenState = "valid" | "expired" | "invalid";

interface ResetRow {
  userId: string;
  expiresAt: number;
  usedAt: number | null;
}

/* the raw token is never stored: the map is keyed by its digest */
const tokens = new Map<string, ResetRow>();
const digest = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export class PasswordResetService {
  /* the same answer for a real address and a stranger's */
  public async request(email: string): Promise<{ devResetUrl: string | null }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.findUser(normalized);
    if (!user) return { devResetUrl: null };

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${config.frontendUrl}/reset-password`,
      });
      if (error) logger.warn(`[reset] Supabase refused the recovery email: ${error.message}`);
      return { devResetUrl: null };
    }

    this.prune();
    const token = crypto.randomBytes(32).toString("base64url");
    tokens.set(digest(token), { userId: user.id, expiresAt: Date.now() + RESET_TTL_MS, usedAt: null });

    const url = `${config.frontendUrl}/reset-password?token=${token}`;
    logger.info(`[reset] password reset link for ${user.email}: ${url}`);
    return { devResetUrl: config.env === "production" ? null : url };
  }

  public async inspect(token: string): Promise<ResetTokenState> {
    this.prune();
    const row = tokens.get(digest(token));
    if (!row || row.usedAt) return "invalid";
    return row.expiresAt < Date.now() ? "expired" : "valid";
  }

  public async confirm(token: string, password: string): Promise<void> {
    this.checkPassword(password);

    const key = digest(token);
    const row = tokens.get(key);
    if (!row || row.usedAt) throw new BadRequestError("This link isn't valid anymore.", "RESET_TOKEN_INVALID");
    if (row.expiresAt < Date.now()) throw new BadRequestError("This link has expired.", "RESET_TOKEN_EXPIRED");

    const hashed = await hashPassword(password);

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.auth.admin.updateUserById(row.userId, { password });
      if (error) throw new DatabaseError(`Password reset failed: ${error.message}`);

      const { error: rowErr } = await supabase
        .from("users")
        .update({ password_hash: hashed, updated_at: new Date().toISOString() })
        .eq("id", row.userId);
      if (rowErr) logger.warn("[reset] password_hash update failed: " + rowErr.message);
    } else {
      database.store.checkFailure();
      const user = database.store.users.get(row.userId);
      if (!user) throw new BadRequestError("This link isn't valid anymore.", "RESET_TOKEN_INVALID");
      user.password_hash = hashed;
      user.updated_at = new Date();
    }

    row.usedAt = Date.now();
    await sessionStore.revokeAllForUser(row.userId);
  }

  /* the Supabase recovery link hands the browser an access token */
  public async confirmWithAccessToken(accessToken: string, password: string): Promise<void> {
    this.checkPassword(password);
    if (!isSupabaseConfigured() || !supabase) {
      throw new BadRequestError("This link isn't valid anymore.", "RESET_TOKEN_INVALID");
    }

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) {
      throw new BadRequestError("This link has expired.", "RESET_TOKEN_EXPIRED");
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(data.user.id, { password });
    if (updateErr) throw new DatabaseError(`Password reset failed: ${updateErr.message}`);

    const hashed = await hashPassword(password);
    const { error: rowErr } = await supabase
      .from("users")
      .update({ password_hash: hashed, updated_at: new Date().toISOString() })
      .eq("id", data.user.id);
    if (rowErr) logger.warn("[reset] password_hash update failed: " + rowErr.message);

    await sessionStore.revokeAllForUser(data.user.id);
  }

  private checkPassword(password: string): void {
    if (password.length < 8) {
      throw new BadRequestError("Password must be at least 8 characters long.", "WEAK_PASSWORD");
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, row] of tokens.entries()) {
      if (row.usedAt || row.expiresAt + 60_000 < now) tokens.delete(key);
    }
  }

  private async findUser(email: string): Promise<{ id: string; email: string } | null> {
    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.from("users").select("id, email").eq("email", email).limit(1);
      if (error) {
        logger.warn(`[reset] Supabase lookup failed: ${error.message}`);
        return null;
      }
      const row = (data ?? [])[0];
      return row ? { id: String(row.id), email: String(row.email) } : null;
    }

    database.store.checkFailure();
    for (const user of database.store.users.values()) {
      if (user.email.toLowerCase() === email) return { id: user.id, email: user.email };
    }
    return null;
  }
}

export const passwordResetService = new PasswordResetService();
