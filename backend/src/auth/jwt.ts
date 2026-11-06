import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../shared/config.js";
import { UnauthorizedError } from "../shared/errors.js";
import type { UserRole } from "../shared/types.js";

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  fullName: string;
  sessionId: string;
}

export const signToken = (
  payload: TokenPayload,
  expiresIn: string = config.jwt.expiresIn
): string => {
  return jwt.sign(payload as object, config.jwt.secret, {
    expiresIn: expiresIn as any,
    algorithm: "HS256",
  });
};

export const verifyToken = (token: string): TokenPayload => {
  try {
    /* The algorithm is pinned to HS256: "none" and an attacker-chosen algorithm
       are rejected by jsonwebtoken before any claim is read. Issuer and audience
       are checked only when this deployment configures them. */
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ["HS256"],
      ...(config.jwt.issuer ? { issuer: config.jwt.issuer } : {}),
      ...(config.jwt.audience ? { audience: config.jwt.audience } : {}),
    });
    if (typeof decoded === "string" || !decoded || typeof (decoded as any).sessionId !== "string") {
      throw new UnauthorizedError("Invalid authentication token.", "INVALID_TOKEN");
    }
    return decoded as TokenPayload;
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new UnauthorizedError("Session expired. Please log in again.", "TOKEN_EXPIRED");
    }
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError("Invalid authentication token.", "INVALID_TOKEN");
  }
};

export const generateSecureToken = (bytes: number = 32): string => {
  return crypto.randomBytes(bytes).toString("hex");
};
