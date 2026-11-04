import type { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service.js";
import { passwordResetService } from "./passwordReset.service.js";
import { sendSuccess, sendCreated } from "../shared/response.js";
import { BadRequestError, UnauthorizedError } from "../shared/errors.js";

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

  public async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Not authenticated");
      const user = await authService.updateProfile(req.user.id, String(req.body.fullName));
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
        "Profile updated"
      );
    } catch (err) {
      next(err);
    }
  }

  public async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Not authenticated");
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(
        req.user.id,
        String(currentPassword),
        String(newPassword),
        req.user.sessionId
      );
      return sendSuccess(res, { changed: true }, "Password changed");
    } catch (err) {
      next(err);
    }
  }

  public async exportAccount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Not authenticated");
      const payload = await authService.exportAccount(req.user.id);
      return sendSuccess(res, payload, "Account exported");
    } catch (err) {
      next(err);
    }
  }

  public async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Not authenticated");
      await authService.deleteAccount(req.user.id, String(req.body.email));
      return sendSuccess(res, { deleted: true }, "Account deleted");
    } catch (err) {
      next(err);
    }
  }

  public async requestPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await passwordResetService.request(String(req.body.email));
      return sendSuccess(
        res,
        { sent: true, devResetUrl: result.devResetUrl },
        "If that address has an account, a reset link is on its way."
      );
    } catch (err) {
      next(err);
    }
  }

  public async inspectPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const state = await passwordResetService.inspect(String(req.params.token));
      return sendSuccess(res, { state }, "Reset link checked");
    } catch (err) {
      next(err);
    }
  }

  public async confirmPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, accessToken, password } = req.body;
      if (token) await passwordResetService.confirm(String(token), String(password));
      else if (accessToken) await passwordResetService.confirmWithAccessToken(String(accessToken), String(password));
      else throw new BadRequestError("A reset token is required.", "RESET_TOKEN_MISSING");
      return sendSuccess(res, { changed: true }, "Password updated");
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
