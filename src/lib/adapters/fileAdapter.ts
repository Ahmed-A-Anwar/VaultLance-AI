/* fileAdapter.ts — the audit room's file rows and the signed download.

   The audit-detail response names files with `name` and a preformatted `meta`;
   the uploads list names them `fileName` with a byte count. Both become the one
   VaultFile the room draws. A download is a *signed* URL the server mints for
   60 seconds: it is handed to the browser and never stored, cached or logged. */

import { z } from "zod";
import type { VaultFile } from "../api";

export const auditFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  fileName: z.string().nullish(),
  kind: z.enum(["file", "folder", "url"]).nullish(),
  meta: z.string().nullish(),
  fileSize: z.union([z.number(), z.string()]).nullish(),
  mimeType: z.string().nullish(),
  sha256: z.string().nullish(),
});

/** One file row → the room's VaultFile, or null when there is no id. */
export function toVaultFile(raw: unknown): VaultFile | null {
  const parsed = auditFileSchema.safeParse(raw);
  if (!parsed.success) return null;
  const f = parsed.data;
  const name = f.name ?? f.fileName;
  if (!name) return null;
  return {
    id: f.id,
    name,
    kind: f.kind ?? "file",
    meta: f.meta ?? "",
  };
}

export const signedUrlSchema = z.object({
  url: z.string().min(1),
  fileName: z.string().nullish(),
  expiresIn: z.number().nullish(),
});

export interface SignedDownload {
  url: string;
  fileName: string;
  expiresIn: number;
}

/** A signed download, only from https. Anything else is refused, not opened. */
export function toSignedDownload(raw: unknown): SignedDownload | null {
  const parsed = signedUrlSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (!parsed.data.url.startsWith("https://")) return null;
  return {
    url: parsed.data.url,
    fileName: parsed.data.fileName ?? "download",
    expiresIn: parsed.data.expiresIn ?? 60,
  };
}
