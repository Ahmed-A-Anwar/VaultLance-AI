/**
 * access.ts — who is allowed to move money on a vault.
 *
 * Two questions only: is this user the invited client (the only party who may
 * approve), and is this user the freelancer who owns the vault (the only party
 * who may submit). Roles are read from the membership row, never from the
 * request body.
 */
import { ForbiddenError } from "../shared/errors.js";
import { database } from "../shared/db.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";

export async function isClientMember(userId: string, vaultId: string): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from("vault_members")
      .select("user_id, role")
      .eq("vault_id", vaultId)
      .eq("user_id", userId);
    return Boolean(data?.some((row: any) => String(row.role).toUpperCase() === "CLIENT"));
  }
  for (const member of database.store.members.values()) {
    if (member.vault_id === vaultId && member.user_id === userId && member.role === "CLIENT") return true;
  }
  return false;
}

export async function assertClientMember(userId: string, vaultId: string): Promise<void> {
  if (!(await isClientMember(userId, vaultId))) {
    throw new ForbiddenError("Only the invited client can do that.", "CLIENT_ROLE_REQUIRED");
  }
}

export async function assertFreelancerOwner(userId: string, vaultId: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from("vaults").select("freelancer_id").eq("id", vaultId).maybeSingle();
    if (!data || data.freelancer_id !== userId) {
      throw new ForbiddenError("Only the freelancer who owns this vault can do that.", "OWNERSHIP_REQUIRED");
    }
    return;
  }
  const vault = database.store.vaults.get(vaultId);
  if (!vault || vault.freelancer_id !== userId) {
    throw new ForbiddenError("Only the freelancer who owns this vault can do that.", "OWNERSHIP_REQUIRED");
  }
}

export async function freelancerEmail(userId: string): Promise<string | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from("users").select("email").eq("id", userId).maybeSingle();
    return data?.email || null;
  }
  return database.store.users.get(userId)?.email || null;
}
