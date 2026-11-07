import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { sendSuccess } from "../shared/response.js";
import { BadRequestError, ForbiddenError } from "../shared/errors.js";
import { loadSample, resetPlayground, startPlayground } from "./service.js";
import { playgroundResetLimiter } from "./resetLimit.js";
import type { SampleKind } from "./samples.js";

const router = Router();

const requirePlayground = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user?.isPlayground) {
    return next(new ForbiddenError("Only a reserved playground session can do that.", "PLAYGROUND_ONLY"));
  }
  next();
};

/* A visitor may start the playground without an account; it is a sandbox whose
   money is PayPal's test money. The two identities behind it are still real
   database users, and every later route validates their sessions. */
const startLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 30,
  message: "Too many playground starts. Try again shortly.",
});

router.post("/start", startLimiter, async (req, res, next) => {
  try {
    const data = await startPlayground(req);
    return sendSuccess(res, data, "Playground ready");
  } catch (err) {
    next(err);
  }
});

router.post("/sample", requireAuth, requirePlayground, async (req, res, next) => {
  try {
    const kind = String(req.body?.kind || "").trim().toLowerCase();
    if (kind !== "complete" && kind !== "incomplete") {
      throw new BadRequestError("kind must be 'complete' or 'incomplete'.", "INVALID_SAMPLE");
    }
    const data = await loadSample(kind as SampleKind, req);
    return sendSuccess(res, data, "Sample loaded and checks run");
  } catch (err) {
    next(err);
  }
});

router.post("/reset", requireAuth, requirePlayground, playgroundResetLimiter, async (req, res, next) => {
  try {
    const data = await resetPlayground(req.user!.id, req.ip, req);
    return sendSuccess(res, data, "Playground reset");
  } catch (err) {
    next(err);
  }
});

export default router;
