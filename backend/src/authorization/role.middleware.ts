import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../shared/types.js";
import { ForbiddenError, UnauthorizedError } from "../shared/errors.js";

export const requireRole = (allowedRoles: UserRole | UserRole[]) => {
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required.", "UNAUTHENTICATED"));
    }

    if (!rolesArray.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Requires one of the following roles: [${rolesArray.join(", ")}]. Current role: '${req.user.role}'.`,
          "INSUFFICIENT_ROLE_PERMISSIONS"
        )
      );
    }

    next();
  };
};
