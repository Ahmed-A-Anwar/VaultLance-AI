import { Router } from "express";
import { manifestService } from "./manifest.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { sendSuccess } from "../shared/response.js";

const router = Router();

router.use(requireAuth);

// Generate canonical manifest and SHA-256 for vault
router.get("/:vaultId", async (req, res, next) => {
  try {
    const vaultId = String(req.params.vaultId);
    const manifest = await manifestService.generateVaultManifest(
      req.user!.id,
      vaultId
    );
    return sendSuccess(res, manifest, "Canonical manifest generated successfully");
  } catch (err) {
    next(err);
  }
});

// Verify manifest reproducibility
router.post("/:vaultId/verify", async (req, res, next) => {
  try {
    const vaultId = String(req.params.vaultId);
    const manifest = await manifestService.generateVaultManifest(
      req.user!.id,
      vaultId
    );
    const result = manifestService.verifyReproducibility(manifest);
    return sendSuccess(res, result, "Manifest reproducibility verified");
  } catch (err) {
    next(err);
  }
});

export default router;
