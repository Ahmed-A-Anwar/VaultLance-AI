/**
 * download.routes.ts — GET /api/vaults/:id/files/:fileId/download
 *
 * A signed URL, 60 seconds, issued only when the vault is PAID and the caller
 * is a member. Locked files never expose a URL: everything else is a 403, and
 * the body carries no storage path.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { sendSuccess } from "../shared/response.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { dataIsolationService } from "../authorization/isolation.service.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { database } from "../shared/db.js";

const router = Router();
router.use(requireAuth);

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "vault-files";

router.get("/:id/files/:fileId/download", async (req, res, next) => {
  try {
    const vaultId = String(req.params.id);
    const fileId = String(req.params.fileId);

    const { vault } = await dataIsolationService.getVaultIfAuthorized(req.user!.id, vaultId);

    if (String(vault.status) !== "PAID") {
      throw new ForbiddenError("Deliverables stay locked until the vault is paid.", "VAULT_NOT_PAID");
    }

    let storagePath: string | null = null;
    let fileName = "download";

    if (isSupabaseConfigured() && supabase) {
      const { data } = await supabase
        .from("vault_files")
        .select("storage_path, file_name, unlocked")
        .eq("id", fileId)
        .eq("vault_id", vaultId)
        .maybeSingle();
      if (!data) throw new NotFoundError("File not found.", "FILE_NOT_FOUND");
      storagePath = data.storage_path;
      fileName = data.file_name;
      if (data.unlocked === false) {
        await supabase.from("vault_files").update({ unlocked: true }).eq("id", fileId);
      }
    } else {
      const file = database.store.files.get(fileId);
      if (!file || file.vault_id !== vaultId) throw new NotFoundError("File not found.", "FILE_NOT_FOUND");
      storagePath = file.storage_path;
      fileName = file.file_name;
    }

    if (!storagePath) throw new NotFoundError("File not found.", "FILE_NOT_FOUND");

    if (!isSupabaseConfigured() || !supabase) {
      throw new AppError("Signed downloads need Supabase storage in this environment.", 503, "STORAGE_UNAVAILABLE");
    }

    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error || !signed?.signedUrl) {
      throw new AppError("Could not sign that download right now.", 502, "SIGNING_FAILED");
    }

    return sendSuccess(res, { url: signed.signedUrl, fileName, expiresIn: 60 }, "Signed download issued");
  } catch (err) {
    next(err);
  }
});

export default router;
