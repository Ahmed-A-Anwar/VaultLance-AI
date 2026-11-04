/**
 * ai.routes.ts — additive diagnostic route for the private AI service.
 *
 * GET /api/ai/health proves the API can reach the engine over 6PN with the
 * internal key, without exposing the engine or its key to a browser. It
 * returns the engine's own health payload, or the clear upstream error.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { sendSuccess } from "../shared/response.js";
import { callAiService, aiServiceUrl } from "./ai.client.js";

const router = Router();
router.use(requireAuth);

router.get("/health", async (_req, res, next) => {
  try {
    const health = await callAiService<Record<string, unknown>>("/health");
    return sendSuccess(res, { target: aiServiceUrl(), upstream: health }, "AI service reachable");
  } catch (err) {
    next(err);
  }
});

export default router;
