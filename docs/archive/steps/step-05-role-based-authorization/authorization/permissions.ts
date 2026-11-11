import type { UserRole } from "../shared/types.js";

export type Permission =
  | "vault:create"
  | "vault:read"
  | "vault:update"
  | "vault:delete"
  | "vault:invite"
  | "vault:accept"
  | "vault:upload"
  | "vault:audit"
  | "vault:authorize_payment"
  | "vault:approve_release";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  FREELANCER: [
    "vault:create",
    "vault:read",
    "vault:update",
    "vault:delete",
    "vault:invite",
    "vault:upload",
    "vault:audit",
  ],
  CLIENT: [
    "vault:read",
    "vault:accept",
    "vault:authorize_payment",
    "vault:approve_release",
  ],
};

export const hasPermission = (role: UserRole, permission: Permission): boolean => {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};
