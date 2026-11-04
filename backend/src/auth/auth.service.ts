import crypto from "crypto";
import { database, type DbUserRecord } from "../shared/db.js";
import { hashPassword, comparePassword } from "./password.js";
import { signToken, verifyToken, type TokenPayload } from "./jwt.js";
import { sessionStore } from "./session.store.js";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
  DatabaseError,
} from "../shared/errors.js";
import type { UserRole, AuthenticatedUser } from "../shared/types.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { logger } from "../shared/logger.js";

export interface RegisterDTO {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    avatarUrl?: string | null;
    createdAt: Date;
  };
  token: string;
  sessionId: string;
  expiresIn: string;
}

export class AuthService {
  /* ------------------------------------------------------------------ */
  /*  REGISTER                                                          */
  /* ------------------------------------------------------------------ */
  public async register(dto: RegisterDTO): Promise<AuthResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // ── Supabase path ──────────────────────────────────────────────
    if (isSupabaseConfigured() && supabase) {
      logger.info(`[auth] Registering ${normalizedEmail} via Supabase`);

      // 1. Check if a profile with this email already exists
      const { data: existing, error: lookupErr } = await supabase
        .from("users")                      // public.users
        .select("id")
        .eq("email", normalizedEmail)
        .limit(1);

      if (lookupErr) {
        logger.error("[auth] Supabase lookup error:", lookupErr);
        throw new DatabaseError(`Database lookup failed: ${lookupErr.message}`);
      }
      if (existing && existing.length > 0) {
        throw new ConflictError(
          "An account with this email address already exists.",
          "EMAIL_ALREADY_EXISTS"
        );
      }

      // 2. Create the user in Supabase Auth (auth.users)
      // Use admin.createUser with email_confirm: true so users can immediately log in
      const { data: authData, error: signUpErr } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: dto.password,
        email_confirm: true,
        user_metadata: {
          full_name: dto.fullName.trim(),
          role: dto.role,
        },
      });

      if (signUpErr) {
        logger.error("[auth] Supabase signUp error:", signUpErr);
        /* the admin API rejects anything but the service role key */
        if (/valid Bearer token/i.test(signUpErr.message || "")) {
          throw new DatabaseError(
            "Supabase rejected the admin call: the API is running with the publishable key. " +
              "Set SUPABASE_SERVICE_ROLE_KEY to the service role key and restart."
          );
        }
        if (
          signUpErr.message?.toLowerCase().includes("already registered") ||
          signUpErr.message?.toLowerCase().includes("already been registered")
        ) {
          throw new ConflictError(
            "An account with this email address already exists.",
            "EMAIL_ALREADY_EXISTS"
          );
        }
        throw new DatabaseError(`Auth signup failed: ${signUpErr.message}`);
      }

      if (!authData.user) {
        throw new DatabaseError("Supabase signUp returned no user.");
      }

      const userId = authData.user.id;
      const now = new Date();

      // 3. Hash password and insert the profile row into public.users
      const hashedPassword = await hashPassword(dto.password);
      const { error: profileErr } = await supabase.from("users").insert([
        {
          id: userId,
          email: normalizedEmail,
          password_hash: hashedPassword,
          role: dto.role,
          full_name: dto.fullName.trim(),
          avatar_url: null,
          account_status: "ACTIVE",
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      ]);

      if (profileErr) {
        logger.error("[auth] Supabase profile insert error:", profileErr);
        // If the profile insert fails (e.g. unique constraint), still clean up
        // by noting the error but don't crash – the auth user is created already.
        // A retry or manual fix can reconcile the two tables.
        if (profileErr.message?.includes("duplicate key")) {
          logger.warn("[auth] Profile row already exists — continuing.");
        } else {
          throw new DatabaseError(
            `Profile creation failed: ${profileErr.message}`
          );
        }
      }

      // 4. Issue our own JWT (we don't use Supabase's session token)
      const sessionId = crypto.randomUUID();
      const tokenPayload: TokenPayload = {
        userId,
        email: normalizedEmail,
        role: dto.role,
        fullName: dto.fullName.trim(),
        sessionId,
      };
      const token = signToken(tokenPayload);
      await sessionStore.createSession(
        userId,
        token,
        dto.ipAddress,
        dto.userAgent,
        sessionId
      );

      logger.info(`[auth] ✓ Registered ${normalizedEmail} (${userId})`);

      return {
        user: {
          id: userId,
          email: normalizedEmail,
          fullName: dto.fullName.trim(),
          role: dto.role,
          avatarUrl: null,
          createdAt: now,
        },
        token,
        sessionId,
        expiresIn: "7d",
      };
    }

    // ── In-memory fallback (tests / DEMO_MODE) ─────────────────────
    database.store.checkFailure();

    for (const u of database.store.users.values()) {
      if (u.email.toLowerCase() === normalizedEmail) {
        throw new ConflictError(
          "An account with this email address already exists.",
          "EMAIL_ALREADY_EXISTS"
        );
      }
    }

    const hashedPassword = await hashPassword(dto.password);
    const userId = crypto.randomUUID();
    const now = new Date();

    const newUser: DbUserRecord = {
      id: userId,
      email: normalizedEmail,
      password_hash: hashedPassword,
      full_name: dto.fullName.trim(),
      role: dto.role,
      avatar_url: null,
      account_status: "ACTIVE",
      created_at: now,
      updated_at: now,
    };

    database.store.users.set(userId, newUser);

    const sessionId = crypto.randomUUID();
    const tokenPayload: TokenPayload = {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      fullName: newUser.full_name,
      sessionId,
    };

    const token = signToken(tokenPayload);
    await sessionStore.createSession(
      userId,
      token,
      dto.ipAddress,
      dto.userAgent,
      sessionId
    );

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name,
        role: newUser.role,
        avatarUrl: newUser.avatar_url,
        createdAt: newUser.created_at,
      },
      token,
      sessionId,
      expiresIn: "7d",
    };
  }

  /* ------------------------------------------------------------------ */
  /*  LOGIN                                                             */
  /* ------------------------------------------------------------------ */
  public async login(dto: LoginDTO): Promise<AuthResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // ── Supabase path ──────────────────────────────────────────────
    if (isSupabaseConfigured() && supabase) {
      logger.info(`[auth] Login attempt for ${normalizedEmail} via Supabase`);

      // 1. Fetch the user directly from public.users table
      const { data: profile, error: profileErr } = await supabase
        .from("users")
        .select("*")
        .eq("email", normalizedEmail)
        .single();

      if (profileErr || !profile) {
        throw new UnauthorizedError(
          "Invalid email or password.",
          "INVALID_CREDENTIALS"
        );
      }

      // 2. Check the password
      let isMatch = false;
      if (profile.password_hash) {
        // Direct bcrypt verification against password_hash column in table users
        isMatch = await comparePassword(dto.password, profile.password_hash);
      } else {
        // Fallback: verify via Supabase Auth signIn if row was created without hash
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: dto.password,
        });
        isMatch = !signInErr;
      }

      if (!isMatch) {
        throw new UnauthorizedError(
          "Invalid email or password.",
          "INVALID_CREDENTIALS"
        );
      }

      if (profile.account_status !== "ACTIVE") {
        throw new UnauthorizedError(
          "Account is not active or has been suspended.",
          "ACCOUNT_SUSPENDED"
        );
      }

      const role: UserRole = (profile.role as UserRole) || "CLIENT";

      // 3. Issue our own JWT
      const sessionId = crypto.randomUUID();
      const tokenPayload: TokenPayload = {
        userId: profile.id,
        email: normalizedEmail,
        role,
        fullName: profile.full_name,
        sessionId,
      };
      const token = signToken(tokenPayload);
      await sessionStore.createSession(
        profile.id,
        token,
        dto.ipAddress,
        dto.userAgent,
        sessionId
      );

      logger.info(
        `[auth] ✓ Logged in ${normalizedEmail} (${profile.id})`
      );

      return {
        user: {
          id: profile.id,
          email: normalizedEmail,
          fullName: profile.full_name,
          role,
          avatarUrl: profile.avatar_url,
          createdAt: new Date(profile.created_at),
        },
        token,
        sessionId,
        expiresIn: "7d",
      };
    }

    // ── In-memory fallback ─────────────────────────────────────────
    database.store.checkFailure();

    let foundUser: DbUserRecord | null = null;
    for (const u of database.store.users.values()) {
      if (u.email.toLowerCase() === normalizedEmail) {
        foundUser = u;
        break;
      }
    }

    if (!foundUser) {
      throw new UnauthorizedError(
        "Invalid email or password.",
        "INVALID_CREDENTIALS"
      );
    }

    if (foundUser.account_status !== "ACTIVE") {
      throw new UnauthorizedError(
        "Account is not active or has been suspended.",
        "ACCOUNT_SUSPENDED"
      );
    }

    const isMatch = await comparePassword(dto.password, foundUser.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError(
        "Invalid email or password.",
        "INVALID_CREDENTIALS"
      );
    }

    const sessionId = crypto.randomUUID();
    const tokenPayload: TokenPayload = {
      userId: foundUser.id,
      email: foundUser.email,
      role: foundUser.role,
      fullName: foundUser.full_name,
      sessionId,
    };

    const token = signToken(tokenPayload);
    await sessionStore.createSession(
      foundUser.id,
      token,
      dto.ipAddress,
      dto.userAgent,
      sessionId
    );

    return {
      user: {
        id: foundUser.id,
        email: foundUser.email,
        fullName: foundUser.full_name,
        role: foundUser.role,
        avatarUrl: foundUser.avatar_url,
        createdAt: foundUser.created_at,
      },
      token,
      sessionId,
      expiresIn: "7d",
    };
  }

  /* ------------------------------------------------------------------ */
  /*  LOGOUT                                                            */
  /* ------------------------------------------------------------------ */
  public async logout(sessionId: string): Promise<void> {
    database.store.checkFailure();
    await sessionStore.revokeSession(sessionId);
  }

  /* ------------------------------------------------------------------ */
  /*  VALIDATE TOKEN + SESSION                                          */
  /* ------------------------------------------------------------------ */
  public async validateTokenAndSession(token: string): Promise<AuthenticatedUser> {
    const payload = verifyToken(token);
    const session = await sessionStore.getSession(payload.sessionId);

    // If session is revoked explicitly, reject
    if (session && session.revoked) {
      throw new UnauthorizedError(
        "Session has been revoked or expired.",
        "SESSION_REVOKED"
      );
    }

    // In production with Supabase, if the server restarted and memory session was wiped,
    // verify the signed JWT payload directly and recreate session
    if (!session && isSupabaseConfigured() && supabase) {
      await sessionStore.createSession(
        payload.userId,
        token,
        undefined,
        undefined,
        payload.sessionId
      );
    } else if (!session) {
      throw new UnauthorizedError(
        "Session has been revoked or expired.",
        "SESSION_REVOKED"
      );
    }

    // ── Supabase path ──────────────────────────────────────────────
    if (isSupabaseConfigured() && supabase) {
      const { data: profile, error } = await supabase
        .from("users")
        .select("id, email, full_name, avatar_url, account_status")
        .eq("id", payload.userId)
        .single();

      if (error || !profile) {
        throw new UnauthorizedError(
          "User account no longer found.",
          "USER_INACTIVE"
        );
      }

      if (profile.account_status !== "ACTIVE") {
        throw new UnauthorizedError(
          "User account no longer active.",
          "USER_INACTIVE"
        );
      }

      return {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: payload.role,
        avatarUrl: profile.avatar_url,
        sessionId: payload.sessionId,
      };
    }

    // ── In-memory fallback ─────────────────────────────────────────
    database.store.checkFailure();
    const user = database.store.users.get(payload.userId);
    if (!user || user.account_status !== "ACTIVE") {
      throw new UnauthorizedError(
        "User account no longer active.",
        "USER_INACTIVE"
      );
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      avatarUrl: user.avatar_url,
      sessionId: payload.sessionId,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  GET CURRENT USER                                                  */
  /* ------------------------------------------------------------------ */
  public async getCurrentUser(userId: string): Promise<DbUserRecord> {
    // ── Supabase path ──────────────────────────────────────────────
    if (isSupabaseConfigured() && supabase) {
      const { data: profile, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !profile) {
        throw new NotFoundError("User not found.", "USER_NOT_FOUND");
      }

      // Also get the role from auth.users metadata
      const { data: authData } = await supabase.auth.admin.getUserById(userId);
      const role: UserRole =
        (authData?.user?.user_metadata?.role as UserRole) || "CLIENT";

      return {
        id: profile.id,
        email: profile.email,
        password_hash: "", // never returned to client
        full_name: profile.full_name,
        role,
        avatar_url: profile.avatar_url,
        account_status: profile.account_status,
        created_at: new Date(profile.created_at),
        updated_at: new Date(profile.updated_at),
      };
    }

    // ── In-memory fallback ─────────────────────────────────────────
    database.store.checkFailure();
    const user = database.store.users.get(userId);
    if (!user) {
      throw new NotFoundError("User not found.", "USER_NOT_FOUND");
    }
    return user;
  }

  /* ------------------------------------------------------------------ */
  /*  UPDATE PROFILE                                                    */
  /* ------------------------------------------------------------------ */
  public async updateProfile(userId: string, fullName: string): Promise<DbUserRecord> {
    const name = fullName.trim();
    if (name.length < 2) throw new BadRequestError("Name needs at least 2 characters.", "INVALID_NAME");
    if (name.length > 100) throw new BadRequestError("Name can be at most 100 characters.", "INVALID_NAME");

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase
        .from("users")
        .update({ full_name: name, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw new DatabaseError(`Profile update failed: ${error.message}`);

      const { error: metaErr } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { full_name: name },
      });
      if (metaErr) logger.warn("[auth] profile metadata update failed: " + metaErr.message);

      return this.getCurrentUser(userId);
    }

    database.store.checkFailure();
    const user = database.store.users.get(userId);
    if (!user) throw new NotFoundError("User not found.", "USER_NOT_FOUND");
    user.full_name = name;
    user.updated_at = new Date();
    return user;
  }

  /* ------------------------------------------------------------------ */
  /*  CHANGE PASSWORD                                                   */
  /* ------------------------------------------------------------------ */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId?: string
  ): Promise<void> {
    if (newPassword.length < 8) {
      throw new BadRequestError("New password must be at least 8 characters long.", "WEAK_PASSWORD");
    }

    if (isSupabaseConfigured() && supabase) {
      const user = await this.getCurrentUser(userId);

      /* verifying the old password means asking the same authority that will
         accept the new one */
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyErr) {
        throw new BadRequestError("Your current password is not correct.", "WRONG_CURRENT_PASSWORD");
      }

      const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (updateErr) throw new DatabaseError(`Password change failed: ${updateErr.message}`);

      /* the profile row keeps a hash too; keep it in step */
      const hashed = await hashPassword(newPassword);
      const { error: rowErr } = await supabase
        .from("users")
        .update({ password_hash: hashed, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (rowErr) logger.warn("[auth] password_hash update failed: " + rowErr.message);

      await sessionStore.revokeAllExcept(userId, keepSessionId);
      return;
    }

    database.store.checkFailure();
    const user = database.store.users.get(userId);
    if (!user) throw new NotFoundError("User not found.", "USER_NOT_FOUND");

    const matches = await comparePassword(currentPassword, user.password_hash);
    if (!matches) {
      throw new BadRequestError("Your current password is not correct.", "WRONG_CURRENT_PASSWORD");
    }

    user.password_hash = await hashPassword(newPassword);
    user.updated_at = new Date();
    await sessionStore.revokeAllExcept(userId, keepSessionId);
  }

  /* ------------------------------------------------------------------ */
  /*  EXPORT THE ACCOUNT                                                */
  /* ------------------------------------------------------------------ */
  public async exportAccount(userId: string): Promise<Record<string, unknown>> {
    const user = await this.getCurrentUser(userId);
    const account = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      createdAt: user.created_at,
    };

    if (isSupabaseConfigured() && supabase) {
      const { data: owned } = await supabase.from("vaults").select("*").eq("freelancer_id", userId);
      const { data: memberships } = await supabase
        .from("vault_members")
        .select("vault_id")
        .eq("user_id", userId);

      const ids = new Set<string>();
      (owned || []).forEach((v: any) => ids.add(v.id));
      (memberships || []).forEach((m: any) => ids.add(m.vault_id));
      const vaultIds = [...ids];

      const files = vaultIds.length
        ? (
            await supabase
              .from("vault_files")
              .select("id, vault_id, file_name, mime_type, file_size, sha256_hash, created_at")
              .in("vault_id", vaultIds)
          ).data
        : [];

      const ledger = vaultIds.length
        ? (
            await supabase
              .from("ledger_events")
              .select("*")
              .in("vault_id", vaultIds)
              .order("created_at", { ascending: false })
          ).data
        : [];

      return {
        exportedAt: new Date().toISOString(),
        account,
        vaults: owned || [],
        memberships: memberships || [],
        files: files || [],
        ledger: ledger || [],
      };
    }

    database.store.checkFailure();
    const vaults = Array.from(database.store.vaults.values()).filter((v) => v.freelancer_id === userId);
    const ids = new Set(vaults.map((v) => v.id));

    return {
      exportedAt: new Date().toISOString(),
      account,
      vaults,
      memberships: Array.from(database.store.members.values()).filter((m) => m.user_id === userId),
      files: Array.from(database.store.files.values()).filter((f) => ids.has(f.vault_id)),
    };
  }

  /* ------------------------------------------------------------------ */
  /*  DELETE THE ACCOUNT                                                */
  /* ------------------------------------------------------------------ */
  public async deleteAccount(userId: string, emailConfirm: string): Promise<void> {
    const user = await this.getCurrentUser(userId);
    if (emailConfirm.trim().toLowerCase() !== String(user.email).toLowerCase()) {
      throw new BadRequestError("That email doesn't match this account.", "EMAIL_MISMATCH");
    }

    /* money in motion blocks deletion: authorized, submitted, or waiting on the
       client's decision */
    const blocking = ["AUTHORIZED", "IN_PROGRESS", "SUBMITTED", "VERIFYING", "AWAITING_APPROVAL"];
    const inMotion = (status: string) => blocking.includes(String(status).toUpperCase());

    if (isSupabaseConfigured() && supabase) {
      const { data: owned } = await supabase
        .from("vaults")
        .select("id, title, status")
        .eq("freelancer_id", userId);

      const blockedRows = (owned || []).filter((v: any) => inMotion(v.status));
      if (blockedRows.length) {
        throw new ConflictError(
          `These vaults still have money in motion: ${blockedRows
            .map((v: any) => v.title)
            .join(", ")}. Resolve them first.`,
          "DELETE_BLOCKED"
        );
      }

      /* memberships first, so no vault points at a user that is gone */
      const { error: memberErr } = await supabase.from("vault_members").delete().eq("user_id", userId);
      if (memberErr) throw new DatabaseError(`Account deletion failed: ${memberErr.message}`);

      const { error: rowErr } = await supabase.from("users").delete().eq("id", userId);
      if (rowErr) throw new DatabaseError(`Account deletion failed: ${rowErr.message}`);

      const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
      if (authErr) throw new DatabaseError(`Account deletion failed: ${authErr.message}`);

      await sessionStore.revokeAllForUser(userId);
      return;
    }

    database.store.checkFailure();
    for (const vault of database.store.vaults.values()) {
      if (vault.freelancer_id === userId && inMotion(vault.status)) {
        throw new ConflictError("Resolve your open vaults before deleting the account.", "DELETE_BLOCKED");
      }
    }

    for (const [id, member] of database.store.members.entries()) {
      if (member.user_id === userId) database.store.members.delete(id);
    }
    database.store.users.delete(userId);
    await sessionStore.revokeAllForUser(userId);
  }
}

export const authService = new AuthService();
