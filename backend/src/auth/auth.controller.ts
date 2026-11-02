import type { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service.js";
import { sendSuccess, sendCreated } from "../shared/response.js";
import { UnauthorizedError } from "../shared/errors.js";

export class AuthController {
  public async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, fullName, role } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await authService.register({
        email,
        password,
        fullName,
        role,
        ipAddress,
        userAgent,
      });

      return sendCreated(res, result, "Account registered successfully");
    } catch (err) {
      next(err);
    }
  }

  public async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await authService.login({
        email,
        password,
        ipAddress,
        userAgent,
      });

      return sendSuccess(res, result, "Logged in successfully");
    } catch (err) {
      next(err);
    }
  }

  public async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.sessionId) {
        throw new UnauthorizedError("Not authenticated");
      }

      await authService.logout(req.user.sessionId);
      return sendSuccess(res, { loggedOut: true }, "Logged out successfully");
    } catch (err) {
      next(err);
    }
  }

  public async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Not authenticated");
      }

      const user = await authService.getCurrentUser(req.user.id);
      return sendSuccess(
        res,
        {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at,
        },
        "User profile retrieved"
      );
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
