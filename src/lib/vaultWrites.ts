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
  decision: "approve" | "reject",
  body?: unknown
): Promise<Vault> {
  if (!realOn("vaultsWrite")) throw new Error("Real vault writes are switched off.");

  const raw = await request<unknown>(`/vaults/${encodeURIComponent(id)}/${decision}`, {
    method: "POST",
    ...(body === undefined ? {} : { body }),
  });

  const vault = toClientVault(raw);
  if (!vault) throw new Error("The decision went through, but the vault came back unreadable.");
  return vault;
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
