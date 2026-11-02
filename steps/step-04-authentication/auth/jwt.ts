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
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ["HS256"],
    });
    return decoded as TokenPayload;
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new UnauthorizedError("Session expired. Please log in again.", "TOKEN_EXPIRED");
    }
    throw new UnauthorizedError("Invalid authentication token.", "INVALID_TOKEN");
  }
};

export const generateSecureToken = (bytes: number = 32): string => {
  return crypto.randomBytes(bytes).toString("hex");
};
