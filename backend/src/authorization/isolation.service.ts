import { database } from "../shared/db.js";
import { ForbiddenError, NotFoundError } from "../shared/errors.js";

export class DataIsolationService {
  public async getVaultIfAuthorized(userId: string, vaultId: string) {
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
    database.store.checkFailure();
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
