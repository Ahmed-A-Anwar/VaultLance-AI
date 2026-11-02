import type { Request, Response, NextFunction } from "express";
import { authService } from "../auth/auth.service.js";
import { UnauthorizedError } from "../shared/errors.js";

export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedError("Authentication token is required.", "MISSING_TOKEN");
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new UnauthorizedError("Malformed Authorization header. Format: Bearer <token>", "INVALID_TOKEN_FORMAT");
    }

    const token = parts[1];
    const user = await authService.validateTokenAndSession(token);

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
