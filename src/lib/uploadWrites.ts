/* uploadWrites.ts — the archive upload and the manifest, behind FX.real.uploads.

   Three calls, in the order the drawer makes them: upload the archive, build the
   canonical manifest, then re-verify it reproduces. The upload gets the 30s
   timeout because a archive over a slow link is not a hung request.

   Nothing here reads the file into memory twice or inspects its contents: the
   server hashes what it stored, and this module only carries the answer. */

import { UPLOAD_TIMEOUT_MS, request } from "./http";
import { realOn } from "../config/fx";

export interface UploadedArchive {
  /** the server's file id, when it returns one; not every build does */
  id?: string;
  name?: string;
}

export interface BuiltManifest {
  /** the locked SHA-256 the audit reads; empty when the API did not send one */
  hash: string;
  totalFiles: number;
}

const str = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

/** POST /api/uploads/:vaultId — multipart, one file. */
export async function uploadArchive(vaultId: string, file: File): Promise<UploadedArchive> {
  if (!realOn("uploads")) throw new Error("Real uploads are switched off.");

  const form = new FormData();
  form.append("file", file);

  const raw = (await request<unknown>(`/uploads/${encodeURIComponent(vaultId)}`, {
    method: "POST",
    form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  })) as Record<string, unknown> | null;

  const row = (raw && typeof raw === "object" && "file" in raw ? raw.file : raw) as Record<string, unknown> | null;
  return {
    ...(str(row?.id) ?? str(row?.fileId) ? { id: str(row?.id) ?? str(row?.fileId) } : {}),
    ...(str(row?.fileName) ?? str(row?.name) ? { name: str(row?.fileName) ?? str(row?.name) } : {}),
  };
}

/** GET /api/manifests/:vaultId — the canonical manifest for what was stored. */
export async function buildManifest(vaultId: string): Promise<BuiltManifest> {
  if (!realOn("uploads")) throw new Error("Real uploads are switched off.");

  const raw = (await request<unknown>(`/manifests/${encodeURIComponent(vaultId)}`, { method: "GET" })) as Record<
    string,
    unknown
  > | null;

  const hash = str(raw?.manifestHash) ?? str(raw?.hash) ?? "";
  const count = Number(raw?.totalFiles);
  return { hash, totalFiles: Number.isFinite(count) ? count : 0 };
}

/** POST /api/manifests/:vaultId/verify — does the stored set still hash the same? */
export async function verifyManifest(vaultId: string): Promise<{ reproducible: boolean }> {
  if (!realOn("uploads")) throw new Error("Real uploads are switched off.");

  const raw = (await request<unknown>(`/manifests/${encodeURIComponent(vaultId)}/verify`, { method: "POST" })) as Record<
    string,
    unknown
  > | null;

  /* an API that answers without the field has not told us it failed: only an
     explicit false refuses the delivery */
  return { reproducible: raw?.reproducible !== false };
}
