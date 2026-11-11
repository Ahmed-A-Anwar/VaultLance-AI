import type { UserRole } from "../shared/types.js";

export const ROLES = {
  FREELANCER: "FREELANCER" as UserRole,
  CLIENT: "CLIENT" as UserRole,
} as const;

export const ALL_ROLES: UserRole[] = ["FREELANCER", "CLIENT"];

export const isValidRole = (role: string): role is UserRole => {
  return ALL_ROLES.includes(role as UserRole);
};
