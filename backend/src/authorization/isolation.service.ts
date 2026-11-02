import { database, type DbVaultRecord, type DbVaultMemberRecord } from "../shared/db.js";
import { ForbiddenError, NotFoundError } from "../shared/errors.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";

export class DataIsolationService {
  public async getVaultIfAuthorized(userId: string, vaultId: string) {
    // ── Supabase path ──────────────────────────────────────────────
    if (isSupabaseConfigured() && supabase) {
      const { data: vault, error: vErr } = await supabase
        .from("vaults")
        .select("*")
        .eq("id", vaultId)
        .single();

      if (vErr || !vault) {
        throw new NotFoundError(`Vault with ID '${vaultId}' was not found.`, "VAULT_NOT_FOUND");
      }

      // Check if user is the freelancer owner
      if (vault.freelancer_id === userId) {
        return { vault, userRoleInVault: "OWNER" as const };
      }

      // Check if user is a member
      const { data: members } = await supabase
        .from("vault_members")
        .select("*")
        .eq("vault_id", vaultId)
        .eq("user_id", userId);

      const memberMatch = members && members.length > 0 ? members[0] : null;

      if (!memberMatch) {
        throw new ForbiddenError(
          "Access denied. You do not have permission to view or interact with this vault.",
          "CROSS_TENANT_ACCESS_DENIED"
        );
      }

      return { vault, userRoleInVault: memberMatch.role, membership: memberMatch };
    }

    // ── In-memory fallback ─────────────────────────────────────────
    database.store.checkFailure();
    const vault = database.store.vaults.get(vaultId);
    if (!vault) {
      throw new NotFoundError(`Vault with ID '${vaultId}' was not found.`, "VAULT_NOT_FOUND");
    }

    // Check if user is the freelancer owner
    if (vault.freelancer_id === userId) {
      return { vault, userRoleInVault: "OWNER" as const };
    }

    // Check if user is a member
    let memberMatch = null;
    for (const member of database.store.members.values()) {
      if (member.vault_id === vaultId && member.user_id === userId) {
        memberMatch = member;
        break;
      }
    }

    if (!memberMatch) {
      // User is completely unrelated: prevent IDOR access
      throw new ForbiddenError(
        "Access denied. You do not have permission to view or interact with this vault.",
        "CROSS_TENANT_ACCESS_DENIED"
      );
    }

    return { vault, userRoleInVault: memberMatch.role, membership: memberMatch };
  }

  public async assertVaultOwnership(userId: string, vaultId: string) {
    if (isSupabaseConfigured() && supabase) {
      const { data: vault, error } = await supabase
        .from("vaults")
        .select("*")
        .eq("id", vaultId)
        .single();

      if (error || !vault) {
        throw new NotFoundError(`Vault with ID '${vaultId}' was not found.`, "VAULT_NOT_FOUND");
      }

      if (vault.freelancer_id !== userId) {
        throw new ForbiddenError(
          "Only the creator (freelancer) of this vault has permission to perform this modification.",
          "OWNERSHIP_REQUIRED"
        );
      }

      return vault;
    }

    database.store.checkFailure();
    const vault = database.store.vaults.get(vaultId);
    if (!vault) {
      throw new NotFoundError(`Vault with ID '${vaultId}' was not found.`, "VAULT_NOT_FOUND");
    }

    if (vault.freelancer_id !== userId) {
      throw new ForbiddenError(
        "Only the creator (freelancer) of this vault has permission to perform this modification.",
        "OWNERSHIP_REQUIRED"
      );
    }

    return vault;
  }

  public async assertClientMembership(userId: string, vaultId: string) {
    const { membership } = await this.getVaultIfAuthorized(userId, vaultId);

    if (!membership || membership.role !== "CLIENT") {
      throw new ForbiddenError(
        "This action can only be performed by the invited client.",
        "CLIENT_ROLE_REQUIRED"
      );
    }

    return membership;
  }
}

export const dataIsolationService = new DataIsolationService();
