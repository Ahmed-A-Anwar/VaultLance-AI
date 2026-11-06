import { Router } from "express";
import { authController } from "./auth.controller.js";
import { validate } from "../middleware/validate.js";
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  deleteAccountSchema,
  payoutProfileSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} from "./auth.schemas.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../authorization/role.middleware.js";
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

/* password reset: public, rate-limited, and the same answer for every address */
router.post(
  "/password-reset/request",
  authLimiter,
  validate(passwordResetRequestSchema),
  authController.requestPasswordReset
);
router.get("/password-reset/:token", authController.inspectPasswordReset);
router.post(
  "/password-reset/confirm",
  authLimiter,
  validate(passwordResetConfirmSchema),
  authController.confirmPasswordReset
);
router.get("/me", requireAuth, authController.me);
router.patch("/me", requireAuth, validate(updateProfileSchema), authController.updateProfile);
router.post("/me/password", requireAuth, validate(changePasswordSchema), authController.changePassword);
router.get("/me/export", requireAuth, authController.exportAccount);
router.get(
  "/me/payout-profile",
  requireAuth,
  requireRole("FREELANCER"),
  authController.getPayoutProfile
);
router.put(
  "/me/payout-profile",
  requireAuth,
  requireRole("FREELANCER"),
  validate(payoutProfileSchema),
  authController.savePayoutProfile
);
router.delete("/me", requireAuth, validate(deleteAccountSchema), authController.deleteAccount);

export default router;
