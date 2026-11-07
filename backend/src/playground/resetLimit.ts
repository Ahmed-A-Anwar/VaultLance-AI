/**
 * resetLimit.ts — three resets an hour per IP.
 *
 * This limiter is not disabled in tests: the reset guard is the thing being
 * exercised, and an external store would make the window invisible to the
 * route. A single API machine (Fly's current shape) makes the in-process map
 * the same window a visitor sees.
 */
import type { Request, Response, NextFunction } from "express";
import { sendError } from "../shared/response.js";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_RESETS = 3;
const buckets = new Map<string, number[]>();

export const resetLimitState = {
  clear() {
    buckets.clear();
  },
};

export function playgroundResetLimiter(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const recent = (buckets.get(key) || []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_RESETS) {
    const retryAt = recent[0] + WINDOW_MS;
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((retryAt - now) / 1000))));
    return sendError(
      res,
      429,
      "The playground resets three times an hour. Try again after the window.",
      "PLAYGROUND_RESET_LIMIT"
    );
  }

  recent.push(now);
  buckets.set(key, recent);
  next();
}
