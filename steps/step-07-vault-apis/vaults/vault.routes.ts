import { Router } from "express";
import { vaultController } from "./vault.controller.js";
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

// Protect all vault endpoints with authentication
router.use(requireAuth);

// Create vault (Freelancer only)
router.post(
  "/",
  requireRole("FREELANCER"),
  validate(createVaultSchema),
  vaultController.create
);

// List vaults for logged in user (Freelancer or Client)
router.get("/", vaultController.list);

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
