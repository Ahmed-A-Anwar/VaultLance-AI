import type { Request, Response, NextFunction } from "express";
import { sendError } from "../shared/response.js";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export const createRateLimiter = (options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) => {
  const store = new Map<string, RateLimitRecord>();

  return (req: Request, res: Response, next: NextFunction) => {
    // Disable rate limiting in test environment
    if (process.env.NODE_ENV === "test") {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const record = store.get(ip);

    if (!record || now > record.resetAt) {
      store.set(ip, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return next();
    }

    record.count++;
    if (record.count > options.maxRequests) {
      return sendError(
        res,
        429,
        options.message || "Too many requests, please try again later.",
        "RATE_LIMIT_EXCEEDED"
      );
    }

    next();
  };
};
