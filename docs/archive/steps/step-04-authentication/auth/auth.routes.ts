import { Router } from "express";
import { authController } from "./auth.controller.js";
import { validate } from "../middleware/validate.js";
import { registerSchema, loginSchema } from "./auth.schemas.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Rate limit auth endpoints: max 20 requests per 5 minutes per IP
const authLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 20,
  message: "Too many authentication requests. Please try again after 5 minutes.",
});

router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/logout", requireAuth, authController.logout);
router.get("/me", requireAuth, authController.me);

export default router;
