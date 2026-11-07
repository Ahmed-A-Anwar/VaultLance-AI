/* vaultWrites.ts — the freelancer's two writes that reach the server today.

   Both sit behind FX.real.vaultsWrite. With the flag off nothing here is
   called: the drawer and the mock keep the path they shipped with, so an
   unmodified build cannot touch a real vault.

   The vault amount is the contract figure a freelancer types, not a charge:
   it travels as `amount` in dollars because that is the field the API takes,
   and the conversion from the UI's integer cents happens once, here. */

import { request } from "./http";
import { realOn } from "../config/fx";
import { toClientVault, vaultSchema } from "./adapters/vaultAdapter";
import type { Vault } from "./api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is this id a server vault, rather than a mock store's `v…` id? */
export const isServerVaultId = (id: string): boolean => UUID.test(id.trim());

export interface NewVaultInput {
  title: string;
  description?: string;
  amountCents: number;
  currency?: string;
}

/** POST /api/vaults — FREELANCER only; the API answers 403 for a client. */
export async function createVaultOnServer(input: NewVaultInput): Promise<{ id: string }> {
  if (!realOn("vaultsWrite")) throw new Error("Real vault writes are switched off.");

  const raw = await request<unknown>("/vaults", {
    method: "POST",
    body: {
      title: input.title.trim(),
      ...(input.description ? { description: input.description.trim() } : {}),
      amount: input.amountCents / 100,
      currency: input.currency ?? "USD",
    },
  });

  const parsed = vaultSchema.safeParse(raw);
  if (!parsed.success) {
    /* created, but unreadable: say so rather than navigate to an undefined id */
    throw new Error("The vault was created, but the server's answer could not be read.");
  }
  return { id: parsed.data.id };
}

/** POST /api/vaults/:id/approve and /reject — the client's decision. Approve is
    the capture trigger; the API refuses both to anyone but the invited client,
    and approve only answers from AWAITING_APPROVAL. */
export async function decideVaultOnServer(
  id: string,
  decision: "approve" | "reject" | "revision",
  body?: unknown
): Promise<Vault> {
  if (!realOn("vaultsWrite")) throw new Error("Real vault writes are switched off.");

  const raw = await request<unknown>(`/vaults/${encodeURIComponent(id)}/${decision}`, {
    method: "POST",
    ...(body === undefined ? {} : { body }),
    /* approving captures at PayPal, a live call that can outlive the default */
    ...(decision === "approve" ? { timeoutMs: 60_000 } : {}),
  });

  const vault = toClientVault(raw);
  if (!vault) throw new Error("The decision went through, but the vault came back unreadable.");
  return vault;
}

/** GET /api/vaults/:id/files/:fileId/download — a signed link, minted only once
    the vault is PAID. The token stays out of the URL: this request carries it in
    a header, and the link that comes back is the server's own. */
export async function signedDownloadUrl(vaultId: string, fileId: string): Promise<string> {
  if (!realOn("vaultsWrite")) throw new Error("Real vault writes are switched off.");

  const raw = (await request<unknown>(
    `/vaults/${encodeURIComponent(vaultId)}/files/${encodeURIComponent(fileId)}/download`,
    { method: "GET" }
  )) as Record<string, unknown> | string | null;

  const url =
    typeof raw === "string"
      ? raw
      : typeof raw?.url === "string"
        ? raw.url
        : typeof raw?.downloadUrl === "string"
          ? raw.downloadUrl
          : "";

  if (!url) throw new Error("The server did not return a download link.");
  return url;
}

/** POST /api/vaults/:id/payout/retry — only the freelancer who owns the vault,
    and only a payout that actually failed; the server refuses anything else. */
export async function retryPayoutOnServer(id: string): Promise<{ status: string }> {
  if (!realOn("payouts")) throw new Error("Real payout writes are switched off.");

  const raw = await request<unknown>(`/vaults/${encodeURIComponent(id)}/payout/retry`, { method: "POST" });
  return (raw ?? {}) as { status: string };
}

/** POST /api/vaults/:id/submit — locks the manifest and moves the vault on. */
export async function submitVaultOnServer(id: string): Promise<{ manifestSha256: string; fileCount: number }> {
  if (!realOn("vaultsWrite")) throw new Error("Real vault writes are switched off.");

  const raw = await request<unknown>(`/vaults/${encodeURIComponent(id)}/submit`, { method: "POST" });
  const data = (raw ?? {}) as { manifestSha256?: unknown; fileCount?: unknown };
  return {
    /* an older server may answer without the hash; the caller keeps the one it
       already holds rather than printing an empty fingerprint */
    manifestSha256: typeof data.manifestSha256 === "string" ? data.manifestSha256 : "",
    fileCount: typeof data.fileCount === "number" ? data.fileCount : 0,
  };
}
