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
} from "../shared/errors.js";
import type { UserRole, AuthenticatedUser } from "../shared/types.js";

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
  public async register(dto: RegisterDTO): Promise<AuthResult> {
    database.store.checkFailure();
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check if email already registered
    for (const u of database.store.users.values()) {
      if (u.email.toLowerCase() === normalizedEmail) {
        throw new ConflictError("An account with this email address already exists.", "EMAIL_ALREADY_EXISTS");
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
    await sessionStore.createSession(userId, token, dto.ipAddress, dto.userAgent, sessionId);

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

  public async login(dto: LoginDTO): Promise<AuthResult> {
    database.store.checkFailure();
    const normalizedEmail = dto.email.trim().toLowerCase();

    let foundUser: DbUserRecord | null = null;
    for (const u of database.store.users.values()) {
      if (u.email.toLowerCase() === normalizedEmail) {
        foundUser = u;
        break;
      }
    }

    if (!foundUser) {
      throw new UnauthorizedError("Invalid email or password.", "INVALID_CREDENTIALS");
    }

    if (foundUser.account_status !== "ACTIVE") {
      throw new UnauthorizedError("Account is not active or has been suspended.", "ACCOUNT_SUSPENDED");
    }

    const isMatch = await comparePassword(dto.password, foundUser.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError("Invalid email or password.", "INVALID_CREDENTIALS");
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
    await sessionStore.createSession(foundUser.id, token, dto.ipAddress, dto.userAgent, sessionId);

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

  public async logout(sessionId: string): Promise<void> {
    database.store.checkFailure();
    await sessionStore.revokeSession(sessionId);
  }

  public async validateTokenAndSession(token: string): Promise<AuthenticatedUser> {
    const payload = verifyToken(token);
    const session = await sessionStore.getSession(payload.sessionId);

    if (!session || session.revoked) {
      throw new UnauthorizedError("Session has been revoked or expired.", "SESSION_REVOKED");
    }

    database.store.checkFailure();
    const user = database.store.users.get(payload.userId);
    if (!user || user.account_status !== "ACTIVE") {
      throw new UnauthorizedError("User account no longer active.", "USER_INACTIVE");
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

  public async getCurrentUser(userId: string): Promise<DbUserRecord> {
    database.store.checkFailure();
    const user = database.store.users.get(userId);
    if (!user) {
      throw new NotFoundError("User not found.", "USER_NOT_FOUND");
    }
    return user;
  }
}

export const authService = new AuthService();
