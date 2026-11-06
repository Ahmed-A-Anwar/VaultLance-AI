/**
 * submit.routes.ts — POST /api/vaults/:id/submit
 *
 * Locks the delivered file list: the canonical manifest and its SHA-256 are
 * stored once, the vault moves to SUBMITTED, and further uploads are refused
 * (see upload.service.ts). Idempotent: a second submit returns the stored hash
 * instead of computing a new one over new files.
 *
 * After a revision the freelancer submits new work: that is a new manifest
 * version, and the deterministic checks run again before the client decides.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { sendSuccess } from "../shared/response.js";
import { ConflictError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import { database } from "../shared/db.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { manifestService } from "../manifests/manifest.service.js";
import { assertFreelancerOwner } from "../money/access.js";
import * as store from "../money/money.store.js";
import { runVaultChecks } from "../audit/run.js";
import { recordFailedChecks } from "../audit/waivers.js";
import { stagingUrlFromText } from "../audit/checks.js";

const router = Router();
router.use(requireAuth);

type LockedManifest = {
  sha: string;
  fileCount: number;
  totalSizeBytes: number;
  version: number;
};

const memoryManifests = new Map<string, LockedManifest>();
export const manifestMemory = { manifests: memoryManifests, reset: () => memoryManifests.clear() };

export async function getLockedManifest(vaultId: string): Promise<LockedManifest | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from("vault_manifests")
      .select("manifest_sha256, file_count, total_size_bytes, version, locked_at")
      .eq("vault_id", vaultId)
      .maybeSingle();
    return data
      ? {
          sha: data.manifest_sha256,
          fileCount: Number(data.file_count),
          totalSizeBytes: Number(data.total_size_bytes),
          version: Number(data.version || 1),
        }
      : null;
  }
  return memoryManifests.get(vaultId) ?? null;
}

async function getVaultDescription(vaultId: string): Promise<string | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from("vaults")
      .select("description")
      .eq("id", vaultId)
      .maybeSingle();
    return data?.description ?? null;
  }
  return database.store.vaults.get(vaultId)?.description ?? null;
}

router.post("/:id/submit", async (req, res, next) => {
  try {
    const vaultId = String(req.params.id);
    await assertFreelancerOwner(req.user!.id, vaultId);

    const vault = await store.getVaultMoney(vaultId);
    if (!vault) throw new ConflictError("Vault not found.", "VAULT_NOT_FOUND");

    const already = await getLockedManifest(vaultId);
    const revising = vault.status === "NEEDS_REVISION";

    if (already && !revising) {
      return sendSuccess(
        res,
        {
          manifestSha256: already.sha,
          fileCount: already.fileCount,
          totalSizeBytes: already.totalSizeBytes,
          version: already.version,
        },
        "Manifest already locked"
      );
    }

    /* A delivery can be locked before the client is invited or funds the hold:
       the requested flow is upload -> submit -> invite. Submitting from DRAFT is
       the same manifest lock; payment stays possible from SUBMITTED. */
    if (!["DRAFT", "IN_PROGRESS", "AUTHORIZED", "NEEDS_REVISION"].includes(vault.status)) {
      throw new ConflictError(
        `Submitting needs status DRAFT, IN_PROGRESS, AUTHORIZED or NEEDS_REVISION (vault is ${vault.status}).`,
        "INVALID_VAULT_STATUS"
      );
    }

    const manifest = await manifestService.generateVaultManifest(req.user!.id, vaultId);
    if (manifest.totalFiles === 0) {
      throw new ConflictError("Upload at least one deliverable before submitting.", "NO_FILES");
    }

    const version = revising ? (already?.version ?? 0) + 1 : 1;
    const description = await getVaultDescription(vaultId);

    if (isSupabaseConfigured() && supabase) {
      const row = {
        manifest_sha256: manifest.manifestHash,
        file_count: manifest.totalFiles,
        total_size_bytes: manifest.totalSizeBytes,
        canonical_json: manifest.canonicalString,
        locked_by: req.user!.id,
        locked_at: new Date().toISOString(),
        version,
      };
      const { error } = already
        ? await supabase.from("vault_manifests").update(row).eq("vault_id", vaultId)
        : await supabase.from("vault_manifests").insert([{ vault_id: vaultId, ...row }]);
      if (error) throw new ConflictError(`Could not lock the manifest: ${error.message}`, "MANIFEST_LOCK_FAILED");
    } else {
      memoryManifests.set(vaultId, {
        sha: manifest.manifestHash,
        fileCount: manifest.totalFiles,
        totalSizeBytes: manifest.totalSizeBytes,
        version,
      });
    }

    await store.setStatus(vaultId, "SUBMITTED");
    await store.appendLedger(
      vaultId,
      "MANIFEST.LOCKED",
      req.user!.id,
      null,
      vault.currency,
      revising ? `Revised file list locked (version ${version})` : "File list locked on submit",
      { manifestSha256: manifest.manifestHash, fileCount: manifest.totalFiles, version }
    );

    /* a revision is new work: read it again and move through the existing
       SUBMITTED -> VERIFYING -> AWAITING_APPROVAL edges */
    if (revising) {
      const checks = await runVaultChecks(vaultId, {
        description,
        manifest: {
          sha: manifest.manifestHash,
          fileCount: manifest.totalFiles,
          totalSizeBytes: manifest.totalSizeBytes,
        },
        stagingUrl: stagingUrlFromText(description),
      });
      await recordFailedChecks(vaultId, checks);
      await store.setStatus(vaultId, "VERIFYING");
      await store.setStatus(vaultId, "AWAITING_APPROVAL");

      const failed = checks.filter((check) => check.result === "fail");
      await store.appendLedger(
        vaultId,
        "AUDIT_COMPLETED",
        req.user!.id,
        null,
        vault.currency,
        `Audit re-ran on version ${version}: ${failed.length} failed`,
        { version, failedCheckIds: failed.map((check) => check.id) }
      );
      logger.info(`[submit] vault ${vaultId} resubmitted as manifest version ${version} (${failed.length} failed)`);
    } else {
      logger.info(`[submit] vault ${vaultId} locked with ${manifest.totalFiles} file(s)`);
    }

    return sendSuccess(
      res,
      {
        manifestSha256: manifest.manifestHash,
        fileCount: manifest.totalFiles,
        totalSizeBytes: manifest.totalSizeBytes,
        version,
      },
      revising ? "Revision submitted, checks re-run" : "Deliverables submitted and locked"
    );
  } catch (err) {
    next(err);
  }
});

export default router;
