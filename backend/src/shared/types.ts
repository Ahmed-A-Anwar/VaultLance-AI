import type { Request } from "express";

export type UserRole = "FREELANCER" | "CLIENT";

export type VaultStatus =
  | "DRAFT"
  | "AWAITING_CLIENT"
  | "AWAITING_AUTHORIZATION"
  | "AUTHORIZED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "VERIFYING"
  | "NEEDS_REVISION"
  | "AWAITING_APPROVAL"
  | "CAPTURE_PENDING"
  | "PAID"
  | "CANCELLED"
  | "EXPIRED"
  | "DISPUTED";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string | null;
  sessionId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}
