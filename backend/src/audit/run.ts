/**
 * run.ts — run the deterministic checks for a vault outside the read routes.
 *
 * A revision approves new files, so submitting again has to re-read them and
 * recompute the report. This is the same runner the audit routes use; it is
 * separate so the submit route does not import an HTTP router.
 */
import { database } from "../shared/db.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import {
  runDeterministicChecks,
  stagingUrlFromText,
  type AuditCheck,
  type AuditFile,
  type AuditManifest,
} from "./checks.js";

export async function loadAuditFiles(vaultId: string): Promise<AuditFile[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from("vault_files").select("*").eq("vault_id", vaultId);
    return (data || []).map((file: any) => ({
      id: String(file.id),
      name: String(file.file_name),
      mimeType: String(file.mime_type || "application/octet-stream"),
      size: Number(file.file_size || 0),
      sha256: String(file.sha256_hash || ""),
      storagePath: file.storage_path ? String(file.storage_path) : undefined,
    }));
  }

  return Array.from(database.store.files.values())
    .filter((file) => file.vault_id === vaultId)
    .map((file) => ({
      id: file.id,
      name: file.file_name,
      mimeType: file.mime_type,
      size: Number(file.file_size),
      sha256: file.sha256_hash,
      storagePath: file.storage_path,
    }));
}

export async function runVaultChecks(
  vaultId: string,
  options: { description?: string | null; manifest?: AuditManifest | null; stagingUrl?: string | null }
): Promise<AuditCheck[]> {
  const files = await loadAuditFiles(vaultId);
  const run = await runDeterministicChecks({
    vaultId,
    files,
    manifest: options.manifest ?? null,
    stagingUrl: options.stagingUrl ?? stagingUrlFromText(options.description),
  });
  return run.checks;
}
