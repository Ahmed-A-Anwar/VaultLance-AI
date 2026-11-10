/**
 * invite.store.ts — VL-XXXX-XXXX invite codes, single use, 7 days.
 *
 * Codes are generated with crypto.randomInt over an unambiguous alphabet and
 * never reused. Redemption is a compare-and-set on used_by so two clients
 * racing the same code cannot both join.
 */
import crypto from "crypto";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { database } from "../shared/db.js";
import { invalidateVaultListCache } from "./vault-list.cache.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TTL_DAYS = 7;

const memoryInvites = new Map<string, { vaultId: string; code: string; expiresAt: Date; usedBy: string | null }>();

export const inviteMemory = { invites: memoryInvites, reset: () => memoryInvites.clear() };

export function newInviteCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]).join("");
  return `VL-${block()}-${block()}`;
}

export async function createInvite(vaultId: string, createdBy: string): Promise<{ code: string; expiresAt: string }> {
  const code = newInviteCode();
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from("vault_invites").insert([
      {
        id: crypto.randomUUID(),
        vault_id: vaultId,
        code,
        created_by: createdBy,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
    if (error) throw new Error(`Could not create the invite code: ${error.message}`);
  } else {
    memoryInvites.set(code, { vaultId, code, expiresAt, usedBy: null });
  }

  return { code, expiresAt: expiresAt.toISOString() };
}

export async function redeemInvite(code: string, vaultId: string, userId: string): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from("vault_invites")
      .select("id, expires_at, used_by")
      .eq("code", code)
      .eq("vault_id", vaultId)
      .maybeSingle();

    if (!data || data.used_by || new Date(data.expires_at).getTime() < Date.now()) return false;

    const { data: claimed } = await supabase
      .from("vault_invites")
      .update({ used_by: userId, used_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("used_by", null)
      .select("id");

    return Boolean(claimed && claimed.length === 1);
  }

  const invite = memoryInvites.get(code);
  if (!invite || invite.vaultId !== vaultId || invite.usedBy) return false;
  if (invite.expiresAt.getTime() < Date.now()) return false;
  invite.usedBy = userId;
  return true;
}

/**
 * Redeem a code when the caller holds only the code, not the vault id.
 *
 * Same rules as redeemInvite: single use, seven days, and a null answer for
 * wrong, spent and expired codes alike, so the route cannot be used to probe
 * which code exists. Returns the vault the invite belonged to.
 */
export async function redeemInviteByCode(code: string, userId: string): Promise<{ vaultId: string } | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from("vault_invites")
      .select("id, vault_id, expires_at, used_by")
      .eq("code", code)
      .maybeSingle();

    if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;

    /* the client who already spent this code is the same client retrying:
       answer with the same vault instead of failing their own code */
    if (data.used_by) return data.used_by === userId ? { vaultId: String(data.vault_id) } : null;

    const { data: claimed } = await supabase
      .from("vault_invites")
      .update({ used_by: userId, used_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("used_by", null)
      .select("vault_id");

    if (claimed && claimed.length === 1) return { vaultId: String(data.vault_id) };

    /* lost the race to a concurrent request from the same client? */
    const { data: after } = await supabase
      .from("vault_invites")
      .select("vault_id, used_by")
      .eq("id", data.id)
      .maybeSingle();
    return after?.used_by === userId ? { vaultId: String(after.vault_id) } : null;
  }

  const invite = memoryInvites.get(code);
  if (!invite || invite.expiresAt.getTime() < Date.now()) return null;
  /* single use, but a retry by the same client is idempotent */
  if (invite.usedBy) return invite.usedBy === userId ? { vaultId: invite.vaultId } : null;
  invite.usedBy = userId;
  return { vaultId: invite.vaultId };
}

export async function addClientMember(vaultId: string, userId: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const { data: existing } = await supabase
      .from("vault_members")
      .select("id")
      .eq("vault_id", vaultId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("vault_members")
        .update({ invitation_status: "ACCEPTED", joined_at: new Date().toISOString() })
        .eq("id", existing.id);
      invalidateVaultListCache();
      return;
    }

    await supabase.from("vault_members").insert([
      {
        id: crypto.randomUUID(),
        vault_id: vaultId,
        user_id: userId,
        role: "CLIENT",
        invitation_status: "ACCEPTED",
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
    invalidateVaultListCache();
    return;
  }

  for (const member of database.store.members.values()) {
    if (member.vault_id === vaultId && member.user_id === userId) {
      member.invitation_status = "ACCEPTED";
      member.joined_at = new Date();
      invalidateVaultListCache();
      return;
    }
  }
  database.store.members.set(`invite-${userId}-${vaultId}`, {
    id: `invite-${userId}-${vaultId}`,
    vault_id: vaultId,
    user_id: userId,
    role: "CLIENT",
    invitation_status: "ACCEPTED",
    joined_at: new Date(),
    created_at: new Date(),
  });
  invalidateVaultListCache();
}
