import { Router } from "express";
import { vaultController } from "./vault.controller.js";
import { vaultDomainService } from "./vault.domain-service.js";
import { verifyToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../authorization/role.middleware.js";
import { validate } from "../middleware/validate.js";
import {
  createVaultSchema,
  updateVaultSchema,
  inviteClientSchema,
  vaultIdParamSchema,
} from "./vault.schemas.js";

const router = Router();

/* Start the list read as soon as the signed token is readable, while
   requireAuth checks the session row and profile. The handler only receives
   the rows after requireAuth succeeds; the read is discarded on any auth
   failure. This removes the auth wait from the dashboard's critical path. */
const prefetchVaultList = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(authHeader.slice(7).trim());
      const promise = vaultDomainService.getVaultsForUser(payload.userId);
      promise.catch(() => {});
      res.locals.vaultsPromise = promise;
    } catch {
      /* requireAuth produces the public 401 for a bad or expired token. */
    }
  }
  next();
};

// List vaults for logged in user (Freelancer or Client)
router.get("/", prefetchVaultList, requireAuth, vaultController.list);

// Protect all remaining vault endpoints with authentication
router.use(requireAuth);

// Create vault (Freelancer only)
router.post(
  "/",
  requireRole("FREELANCER"),
  validate(createVaultSchema),
  vaultController.create
);

// Get specific vault (Participant only)
router.get("/:id", validate(vaultIdParamSchema), vaultController.getById);

// Update vault (Freelancer owner only)
router.patch(
  "/:id",
  requireRole("FREELANCER"),
  validate(updateVaultSchema),
  vaultController.update
);

// Invite client (Freelancer owner only)
router.post(
  "/:id/invite",
  requireRole("FREELANCER"),
  validate(inviteClientSchema),
  vaultController.invite
);

// Accept invite (Client only)
router.post(
  "/:id/accept",
  requireRole("CLIENT"),
  validate(vaultIdParamSchema),
  vaultController.accept
);

export default router;
