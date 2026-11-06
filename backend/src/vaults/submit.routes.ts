/**
 * submit.routes.ts — POST /api/vaults/:id/submit
 *
 * Locks the delivered file list: the canonical manifest and its SHA-256 are
 * stored once, the vault moves to SUBMITTED, and further uploads are refused
 * (see upload.service.ts). Idempotent: a second submit returns the stored hash
 * instead of computing a new one over new files.
 */
import { Router } from "express";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.middleware.js";
import { sendSuccess } from "../shared/response.js";
import { ConflictError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { manifestService } from "../manifests/manifest.service.js";
import { assertFreelancerOwner } from "../money/access.js";
import * as store from "../money/money.store.js";

const router = Router();
router.use(requireAuth);

const memoryManifests = new Map<string, { sha: string; fileCount: number; totalSizeBytes: number }>();
export const manifestMemory = { manifests: memoryManifests, reset: () => memoryManifests.clear() };

export async function getLockedManifest(vaultId: string) {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from("vault_manifests")
      .select("manifest_sha256, file_count, total_size_bytes, locked_at")
      .eq("vault_id", vaultId)
      .maybeSingle();
    return data ? { sha: data.manifest_sha256, fileCount: Number(data.file_count), totalSizeBytes: Number(data.total_size_bytes), lockedAt: data.locked_at } : null;
  }
  const row = memoryManifests.get(vaultId);
  return row ? { ...row, lockedAt: null } : null;
}

router.post("/:id/submit", async (req, res, next) => {
  try {
    const vaultId = String(req.params.id);
    await assertFreelancerOwner(req.user!.id, vaultId);

    const already = await getLockedManifest(vaultId);
    if (already) {
      return sendSuccess(res, { manifestSha256: already.sha, fileCount: already.fileCount, totalSizeBytes: already.totalSizeBytes }, "Manifest already locked");
    }

    const vault = await store.getVaultMoney(vaultId);
    if (!vault) throw new ConflictError("Vault not found.", "VAULT_NOT_FOUND");
    /* A delivery can be locked before the client is invited or funds the hold:
       the requested flow is upload -> submit -> invite. Submitting from DRAFT is
       the same manifest lock; payment stays possible from SUBMITTED. */
    if (!["DRAFT", "IN_PROGRESS", "AUTHORIZED"].includes(vault.status)) {
      throw new ConflictError(`Submitting needs status DRAFT, IN_PROGRESS or AUTHORIZED (vault is ${vault.status}).`, "INVALID_VAULT_STATUS");
    }

    const manifest = await manifestService.generateVaultManifest(req.user!.id, vaultId);
    if (manifest.totalFiles === 0) {
      throw new ConflictError("Upload at least one deliverable before submitting.", "NO_FILES");
    }

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.from("vault_manifests").insert([
        {
          vault_id: vaultId,
          manifest_sha256: manifest.manifestHash,
          file_count: manifest.totalFiles,
          total_size_bytes: manifest.totalSizeBytes,
          canonical_json: manifest.canonicalString,
          locked_by: req.user!.id,
          locked_at: new Date().toISOString(),
        },
      ]);
      if (error) throw new ConflictError(`Could not lock the manifest: ${error.message}`, "MANIFEST_LOCK_FAILED");
    } else {
      memoryManifests.set(vaultId, {
        sha: manifest.manifestHash,
        fileCount: manifest.totalFiles,
        totalSizeBytes: manifest.totalSizeBytes,
      });
    }

    await store.setStatus(vaultId, "SUBMITTED");
    await store.appendLedger(vaultId, "MANIFEST.LOCKED", req.user!.id, null, vault.currency, "File list locked on submit", {
      manifestSha256: manifest.manifestHash,
      fileCount: manifest.totalFiles,
    });
    logger.info(`[submit] vault ${vaultId} locked with ${manifest.totalFiles} file(s)`);

    return sendSuccess(
      res,
      { manifestSha256: manifest.manifestHash, fileCount: manifest.totalFiles, totalSizeBytes: manifest.totalSizeBytes },
      "Deliverables submitted and locked"
    );
  } catch (err) {
    next(err);
  }
});

export default router;
