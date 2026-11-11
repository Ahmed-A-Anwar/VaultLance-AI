import crypto from "crypto";
import { database, type DbVaultRecord, type DbVaultMemberRecord } from "../shared/db.js";
import { VaultEntity } from "./vault.entity.js";
import { VaultStateMachine } from "./vault.state-machine.js";
import { dataIsolationService } from "../authorization/isolation.service.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from "../shared/errors.js";
import type { VaultStatus } from "../shared/types.js";
import type { VaultDTO, VaultMemberItem, VaultFileItem } from "./vault.types.js";

export interface CreateVaultDTO {
  freelancerId: string;
  title: string;
  description?: string;
  amount: number;
  currency?: string;
  expiresAt?: Date | null;
}

export interface UpdateVaultDTO {
  userId: string;
  vaultId: string;
  title?: string;
  description?: string;
  amount?: number;
  status?: VaultStatus;
}

export interface InviteClientDTO {
  freelancerId: string;
  vaultId: string;
  clientEmail: string;
}

export interface AcceptInviteDTO {
  clientId: string;
  vaultId: string;
}

export class VaultDomainService {
  public async createVault(dto: CreateVaultDTO): Promise<VaultDTO> {
    database.store.checkFailure();
    const vaultId = crypto.randomUUID();
    const entity = new VaultEntity({
      id: vaultId,
      freelancerId: dto.freelancerId,
      title: dto.title,
      description: dto.description,
      amount: dto.amount,
      currency: dto.currency || "USD",
      status: "DRAFT",
      expiresAt: dto.expiresAt,
    });

    const record: DbVaultRecord = {
      id: entity.id,
      freelancer_id: entity.freelancerId,
      title: entity.title,
      description: entity.description,
      amount: entity.amount,
      currency: entity.currency,
      status: entity.status,
      expires_at: entity.expiresAt,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };

    database.store.vaults.set(entity.id, record);

    // Create owner member record
    const memberId = crypto.randomUUID();
    const memberRecord: DbVaultMemberRecord = {
      id: memberId,
      vault_id: entity.id,
      user_id: entity.freelancerId,
      role: "FREELANCER",
      invitation_status: "ACCEPTED",
      joined_at: new Date(),
      created_at: new Date(),
    };
    database.store.members.set(memberId, memberRecord);

    return this.getVaultById(dto.freelancerId, entity.id);
  }

  public async getVaultsForUser(userId: string): Promise<VaultDTO[]> {
    database.store.checkFailure();
    // Strictly isolate: find vaults where user is freelancer OR user is an accepted/invited member
    const userVaultIds = new Set<string>();

    for (const v of database.store.vaults.values()) {
      if (v.freelancer_id === userId) {
        userVaultIds.add(v.id);
      }
    }

    for (const m of database.store.members.values()) {
      if (m.user_id === userId) {
        userVaultIds.add(m.vault_id);
      }
    }

    const results: VaultDTO[] = [];
    for (const vaultId of userVaultIds) {
      try {
        const dto = await this.getVaultById(userId, vaultId);
        results.push(dto);
      } catch {
        // Skip inaccessible
      }
    }

    // Sort by created_at desc
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async getVaultById(userId: string, vaultId: string): Promise<VaultDTO> {
    database.store.checkFailure();
    const { vault } = await dataIsolationService.getVaultIfAuthorized(userId, vaultId);

    // Collect members
    const members: VaultMemberItem[] = [];
    for (const m of database.store.members.values()) {
      if (m.vault_id === vaultId) {
        const u = database.store.users.get(m.user_id);
        members.push({
          id: m.id,
          userId: m.user_id,
          email: u?.email,
          fullName: u?.full_name,
          role: m.role,
          invitationStatus: m.invitation_status,
          joinedAt: m.joined_at,
          createdAt: m.created_at,
        });
      }
    }

    // Collect files
    const files: VaultFileItem[] = [];
    for (const f of database.store.files.values()) {
      if (f.vault_id === vaultId) {
        files.push({
          id: f.id,
          fileName: f.file_name,
          storagePath: f.storage_path,
          mimeType: f.mime_type,
          fileSize: f.file_size,
          sha256Hash: f.sha256_hash,
          createdAt: f.created_at,
        });
      }
    }

    return {
      id: vault.id,
      freelancerId: vault.freelancer_id,
      title: vault.title,
      description: vault.description,
      amount: vault.amount,
      currency: vault.currency,
      status: vault.status as VaultStatus,
      expiresAt: vault.expires_at,
      createdAt: vault.created_at,
      updatedAt: vault.updated_at,
      members,
      files,
    };
  }

  public async updateVault(dto: UpdateVaultDTO): Promise<VaultDTO> {
    database.store.checkFailure();
    const vault = await dataIsolationService.assertVaultOwnership(dto.userId, dto.vaultId);

    const entity = new VaultEntity({
      id: vault.id,
      freelancerId: vault.freelancer_id,
      title: vault.title,
      description: vault.description,
      amount: vault.amount,
      currency: vault.currency,
      status: vault.status as VaultStatus,
      expiresAt: vault.expires_at,
      createdAt: vault.created_at,
      updatedAt: vault.updated_at,
    });

    if (dto.title !== undefined || dto.description !== undefined || dto.amount !== undefined) {
      if (entity.status !== "DRAFT" && entity.status !== "AWAITING_CLIENT") {
        throw new BadRequestError(
          "Vault terms (title, description, amount) cannot be modified after funds or contracts are committed.",
          "VAULT_IMMUTABLE_AFTER_AGREEMENT"
        );
      }
      entity.updateDetails(dto.title, dto.description, dto.amount);
    }

    if (dto.status && dto.status !== entity.status) {
      VaultStateMachine.assertTransition(entity.status, dto.status);
      entity.status = dto.status;
      entity.updatedAt = new Date();
    }

    // Save back to db
    vault.title = entity.title;
    vault.description = entity.description;
    vault.amount = entity.amount;
    vault.status = entity.status;
    vault.updated_at = entity.updatedAt;

    return this.getVaultById(dto.userId, dto.vaultId);
  }

  public async inviteClient(dto: InviteClientDTO): Promise<VaultDTO> {
    database.store.checkFailure();
    const vault = await dataIsolationService.assertVaultOwnership(dto.freelancerId, dto.vaultId);

    const clientEmail = dto.clientEmail.trim().toLowerCase();

    // Find registered client user
    let clientUser = null;
    for (const u of database.store.users.values()) {
      if (u.email.toLowerCase() === clientEmail) {
        clientUser = u;
        break;
      }
    }

    if (!clientUser) {
      throw new NotFoundError(
        `No registered client found with email '${dto.clientEmail}'. Client must register first.`,
        "CLIENT_NOT_FOUND"
      );
    }

    if (clientUser.id === dto.freelancerId) {
      throw new BadRequestError("You cannot invite yourself as the client of your own vault.", "SELF_INVITE_NOT_ALLOWED");
    }

    // Check duplicate invitation
    for (const m of database.store.members.values()) {
      if (m.vault_id === dto.vaultId && m.user_id === clientUser.id) {
        if (m.invitation_status === "ACCEPTED") {
          throw new ConflictError("This client has already accepted an invitation to this vault.", "ALREADY_ACCEPTED");
        }
        throw new ConflictError("An invitation is already pending for this client.", "INVITATION_ALREADY_EXISTS");
      }
    }

    // Add membership
    const memberId = crypto.randomUUID();
    const newMember: DbVaultMemberRecord = {
      id: memberId,
      vault_id: dto.vaultId,
      user_id: clientUser.id,
      role: "CLIENT",
      invitation_status: "PENDING",
      invited_by: dto.freelancerId,
      created_at: new Date(),
    };
    database.store.members.set(memberId, newMember);

    // Transition vault status if DRAFT
    if (vault.status === "DRAFT") {
      VaultStateMachine.assertTransition(vault.status as VaultStatus, "AWAITING_CLIENT");
      vault.status = "AWAITING_CLIENT";
      vault.updated_at = new Date();
    }

    return this.getVaultById(dto.freelancerId, dto.vaultId);
  }

  public async acceptInvite(dto: AcceptInviteDTO): Promise<VaultDTO> {
    database.store.checkFailure();
    const vault = database.store.vaults.get(dto.vaultId);
    if (!vault) {
      throw new NotFoundError(`Vault '${dto.vaultId}' not found.`, "VAULT_NOT_FOUND");
    }

    // Find member record for this client
    let memberRecord: DbVaultMemberRecord | null = null;
    for (const m of database.store.members.values()) {
      if (m.vault_id === dto.vaultId && m.user_id === dto.clientId) {
        memberRecord = m;
        break;
      }
    }

    if (!memberRecord) {
      throw new ForbiddenError("You have not been invited to this vault.", "NOT_INVITED");
    }

    if (memberRecord.invitation_status === "ACCEPTED") {
      throw new ConflictError("You have already accepted this invitation.", "ALREADY_ACCEPTED");
    }

    if (memberRecord.invitation_status !== "PENDING") {
      throw new BadRequestError(`Invitation is ${memberRecord.invitation_status.toLowerCase()} and cannot be accepted.`, "INVALID_INVITATION_STATUS");
    }

    // Accept
    memberRecord.invitation_status = "ACCEPTED";
    memberRecord.joined_at = new Date();

    // Transition vault state
    if (vault.status === "AWAITING_CLIENT") {
      VaultStateMachine.assertTransition(vault.status as VaultStatus, "AWAITING_AUTHORIZATION");
      vault.status = "AWAITING_AUTHORIZATION";
      vault.updated_at = new Date();
    }

    return this.getVaultById(dto.clientId, dto.vaultId);
  }
}

export const vaultDomainService = new VaultDomainService();
