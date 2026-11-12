import crypto from "crypto";
import { database, type DbVaultRecord, type DbVaultMemberRecord, type DbVaultFileRecord } from "../shared/db.js";
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
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { getCapture } from "../money/money.store.js";
import { platformFeeCents } from "../money/money.types.js";
import { readVaultList, type VaultListSource } from "./vault-list.query.js";
import {
  getVaultListCache,
  invalidateVaultListCache,
  setVaultListCache,
  vaultListCacheGeneration,
} from "./vault-list.cache.js";

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

    if (isSupabaseConfigured() && supabase) {
      // Insert vault in Supabase
      const { error: vErr } = await supabase.from("vaults").insert([{
        id: entity.id,
        freelancer_id: entity.freelancerId,
        title: entity.title,
        description: entity.description,
        amount: entity.amount,
        currency: entity.currency,
        status: entity.status,
        expires_at: entity.expiresAt ? entity.expiresAt.toISOString() : null,
        created_at: entity.createdAt.toISOString(),
        updated_at: entity.updatedAt.toISOString(),
      }]);

      if (vErr) {
        throw new BadRequestError(`Failed to create vault in database: ${vErr.message}`);
      }

      // Create owner member record in Supabase
      const memberId = crypto.randomUUID();
      await supabase.from("vault_members").insert([{
        id: memberId,
        vault_id: entity.id,
        user_id: entity.freelancerId,
        role: "FREELANCER",
        invitation_status: "ACCEPTED",
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }]);

      // Create ledger event for creation
      await supabase.from("ledger_events").insert([{
        id: crypto.randomUUID(),
        vault_id: entity.id,
        actor_id: entity.freelancerId,
        event_type: "VAULT_CREATED",
        amount: entity.amount,
        currency: entity.currency,
        metadata: { title: entity.title },
        created_at: new Date().toISOString(),
      }]);

      invalidateVaultListCache();
      return this.getVaultById(dto.freelancerId, entity.id);
    }

    // In-memory fallback
    database.store.checkFailure();
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

    invalidateVaultListCache();
    return this.getVaultById(dto.freelancerId, entity.id);
  }

  public async getVaultsForUser(
    userId: string,
    onSource?: (source: VaultListSource) => void
  ): Promise<VaultDTO[]> {
    const readGeneration = vaultListCacheGeneration();
    const cached = getVaultListCache(userId);
    if (cached) {
      onSource?.("cache");
      return cached;
    }

    if (isSupabaseConfigured() && supabase) {
      const client = supabase;

      /* The direct database read is one round trip. If DATABASE_URL is absent
         or the query fails, fall back to the PostgREST reads below. */
      const direct = await readVaultList(userId, onSource);
      if (direct) {
        return this.cacheVaultList(
          userId,
          this.toVaultList(direct.vaults, direct.captures),
          readGeneration
        );
      }

      // Resolve the user's memberships and owned vaults in parallel. Each root
      // read embeds the members, profiles, files and ledger events, so the
      // fallback path is also as few round trips as PostgREST allows.
      const vaultSelect =
        "*, vault_members(*, users!vault_members_user_id_fkey(id,email,full_name)), vault_files(*), ledger_events(vault_id, metadata, created_at)";
      const [memberVaultsResult, ownedVaultsResult, captureResult, payoutResult] = await Promise.all([
        client
          .from("vault_members")
          .select(`vault_id, vaults!inner(${vaultSelect})`)
          .eq("user_id", userId),
        client.from("vaults").select(vaultSelect).eq("freelancer_id", userId),
        // vault_captures has no PostgREST relationship to vaults. It is a small
        // table, so one parallel unfiltered read is cheaper than a second
        // network round trip; only rows for this user's vaults reach the DTOs.
        client.from("vault_captures").select("*"),
        // same reasoning as vault_captures: no PostgREST relationship, tiny table
        client.from("vault_payouts").select("*"),
      ]);

      const vaultsById = new Map<string, any>();
      for (const row of (memberVaultsResult.data || []) as any[]) {
        const vault = row.vaults;
        if (vault?.id) vaultsById.set(String(vault.id), vault);
      }
      for (const vault of (ownedVaultsResult.data || []) as any[]) {
        if (vault?.id) vaultsById.set(String(vault.id), vault);
      }

      return this.cacheVaultList(
        userId,
        this.toVaultList(
          Array.from(vaultsById.values()),
          (captureResult.data || []) as any[],
          (payoutResult.data || []) as any[]
        ),
        readGeneration
      );
    }

    database.store.checkFailure();
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

    return this.cacheVaultList(
      userId,
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      readGeneration
    );
  }

  private cacheVaultList(userId: string, vaults: VaultDTO[], readGeneration: number): VaultDTO[] {
    setVaultListCache(userId, vaults, readGeneration);
    return vaults;
  }

  private toVaultList(vaults: any[], captureRows: any[], payoutRows: any[] = []): VaultDTO[] {
    if (vaults.length === 0) return [];

    const membersByVault = new Map<string, VaultMemberItem[]>();
    const filesByVault = new Map<string, VaultFileItem[]>();
    const ledgerByVault = new Map<string, any[]>();
    for (const vault of vaults) {
      const id = String(vault.id);
      const memberRows = Array.isArray(vault.vault_members) ? vault.vault_members : [];
      membersByVault.set(
        id,
        memberRows.map((m: any) => {
          const profile = Array.isArray(m.users) ? m.users[0] : m.users;
          return {
            id: m.id,
            userId: m.user_id,
            email: profile?.email,
            fullName: profile?.full_name,
            role: m.role,
            invitationStatus: m.invitation_status,
            joinedAt: m.joined_at ? new Date(m.joined_at) : undefined,
            createdAt: new Date(m.created_at),
          };
        })
      );

      filesByVault.set(
        id,
        (Array.isArray(vault.vault_files) ? vault.vault_files : []).map((f: any) => ({
          id: f.id,
          fileName: f.file_name,
          storagePath: f.storage_path,
          mimeType: f.mime_type,
          fileSize: Number(f.file_size),
          sha256Hash: f.sha256_hash,
          createdAt: new Date(f.created_at),
        }))
      );

      // Keep at most the twenty latest events per vault, matching getVaultById.
      ledgerByVault.set(
        id,
        (Array.isArray(vault.ledger_events) ? vault.ledger_events : [])
          .slice()
          .sort(
            (a: any, b: any) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          .slice(0, 20)
      );
    }

    const capturesByVault = new Map<string, any>();
    for (const capture of captureRows) {
      const key = String(capture.vault_id);
      if (!capturesByVault.has(key)) capturesByVault.set(key, capture);
    }

    const payoutsByVault = new Map<string, any>();
    for (const payout of payoutRows) {
      const key = String(payout.vault_id);
      if (!payoutsByVault.has(key)) payoutsByVault.set(key, payout);
    }

    return vaults
      .map((vault) => {
        const id = String(vault.id);
        return this.toVaultDto(
          vault,
          membersByVault.get(id) || [],
          filesByVault.get(id) || [],
          capturesByVault.get(id) || null,
          ledgerByVault.get(id) || [],
          payoutsByVault.get(id) || null
        );
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async getVaultById(userId: string, vaultId: string): Promise<VaultDTO> {
    if (isSupabaseConfigured() && supabase) {
      const { vault } = await dataIsolationService.getVaultIfAuthorized(userId, vaultId);

      // Collect members with user profile details
      const { data: memberRows } = await supabase
        .from("vault_members")
        .select("id, vault_id, user_id, role, invitation_status, joined_at, created_at")
        .eq("vault_id", vaultId);

      const members: VaultMemberItem[] = [];
      for (const m of memberRows || []) {
        const { data: u } = await supabase
          .from("users")
          .select("email, full_name")
          .eq("id", m.user_id)
          .single();

        members.push({
          id: m.id,
          userId: m.user_id,
          email: u?.email,
          fullName: u?.full_name,
          role: m.role,
          invitationStatus: m.invitation_status,
          joinedAt: m.joined_at ? new Date(m.joined_at) : undefined,
          createdAt: new Date(m.created_at),
        });
      }

      // Collect files
      const { data: fileRows } = await supabase
        .from("vault_files")
        .select("*")
        .eq("vault_id", vaultId);

      /* the ids a receipt prints: the vault columns can be empty (a row written
         before the column existed, or a write the database refused), and the
         ledger metadata records the same ids, so it is the fallback */
      const [{ data: captureRow }, { data: moneyEvents }, { data: payoutRow }] = await Promise.all([
        supabase.from("vault_captures").select("*").eq("vault_id", vaultId).maybeSingle(),
        supabase
          .from("ledger_events")
          .select("metadata, created_at")
          .eq("vault_id", vaultId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("vault_payouts").select("*").eq("vault_id", vaultId).maybeSingle(),
      ]);
      const files: VaultFileItem[] = (fileRows || []).map((f) => ({
        id: f.id,
        fileName: f.file_name,
        storagePath: f.storage_path,
        mimeType: f.mime_type,
        fileSize: Number(f.file_size),
        sha256Hash: f.sha256_hash,
        createdAt: new Date(f.created_at),
      }));

      return this.toVaultDto(vault, members, files, captureRow, moneyEvents || [], payoutRow);
    }

    database.store.checkFailure();
    const { vault } = await dataIsolationService.getVaultIfAuthorized(userId, vaultId);

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

    const capture = await getCapture(vaultId);
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
      failedChecks: Array.isArray((vault as any).failed_checks) ? (vault as any).failed_checks : [],
      waivedChecks: Array.isArray((vault as any).waived_checks) ? (vault as any).waived_checks : [],
      revisionNote: (vault as any).revision_note ?? null,
      members,
      files,
      ...(capture
        ? {
            fees: {
              grossCents: capture.grossCents,
              vaultlanceFeeCents: platformFeeCents(capture.grossCents),
              paypalFeeCents: capture.feeCents,
              netCents: capture.netCents,
              payoutCents: capture.payoutCents,
              source: "captured" as const,
            },
          }
        : {}),
    };
  }

  private toVaultDto(
    vault: any,
    members: VaultMemberItem[],
    files: VaultFileItem[],
    captureRow: any,
    moneyEvents: any[],
    payoutRow?: any
  ): VaultDTO {
    /* the ids a receipt prints: the vault columns can be empty (a row written
       before the column existed, or a write the database refused), and the
       ledger metadata records the same ids, so it is the fallback */
    const metas = (moneyEvents || []).map((row: any) => row.metadata || {});
    const fromLedger = (key: string): string | null =>
      (metas.find((m: any) => typeof m[key] === "string" && m[key])?.[key] as string) || null;

    return {
      id: vault.id,
      freelancerId: vault.freelancer_id,
      title: vault.title,
      description: vault.description,
      amount: Number(vault.amount),
      currency: vault.currency,
      status: vault.status as VaultStatus,
      expiresAt: vault.expires_at ? new Date(vault.expires_at) : null,
      createdAt: new Date(vault.created_at),
      updatedAt: new Date(vault.updated_at),
      paypalOrderId: (vault as any).paypal_order_id || fromLedger("orderId"),
      paypalAuthorizationId: (vault as any).paypal_authorization_id || fromLedger("authorizationId"),
      paypalCaptureId: (vault as any).paypal_capture_id || captureRow?.capture_id || fromLedger("captureId"),
      /* the payout is the last thing a receipt is missing: without it a paid
         vault reads as "payout pending" to the freelancer forever */
      payoutStatus: payoutRow?.status ?? null,
      payoutPaypalId: payoutRow?.payout_item_id ?? null,
      failedChecks: Array.isArray((vault as any).failed_checks) ? (vault as any).failed_checks : [],
      waivedChecks: Array.isArray((vault as any).waived_checks) ? (vault as any).waived_checks : [],
      revisionNote: (vault as any).revision_note ?? null,
      members,
      files,
      ...(captureRow
        ? {
            fees: {
              grossCents: Number(captureRow.gross_cents),
              vaultlanceFeeCents: platformFeeCents(Number(captureRow.gross_cents)),
              paypalFeeCents: Number(captureRow.paypal_fee_cents),
              netCents: Number(captureRow.net_cents),
              payoutCents: Number(captureRow.payout_cents),
              source: "captured" as const,
            },
          }
        : {}),
    };
  }

  public async updateVault(dto: UpdateVaultDTO): Promise<VaultDTO> {
    if (isSupabaseConfigured() && supabase) {
      const vault = await dataIsolationService.assertVaultOwnership(dto.userId, dto.vaultId);

      const entity = new VaultEntity({
        id: vault.id,
        freelancerId: vault.freelancer_id,
        title: vault.title,
        description: vault.description,
        amount: Number(vault.amount),
        currency: vault.currency,
        status: vault.status as VaultStatus,
        expiresAt: vault.expires_at ? new Date(vault.expires_at) : null,
        createdAt: new Date(vault.created_at),
        updatedAt: new Date(vault.updated_at),
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

      await supabase
        .from("vaults")
        .update({
          title: entity.title,
          description: entity.description,
          amount: entity.amount,
          status: entity.status,
          updated_at: entity.updatedAt.toISOString(),
        })
        .eq("id", dto.vaultId);

      invalidateVaultListCache();
      return this.getVaultById(dto.userId, dto.vaultId);
    }

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

    vault.title = entity.title;
    vault.description = entity.description;
    vault.amount = entity.amount;
    vault.status = entity.status;
    vault.updated_at = entity.updatedAt;

    invalidateVaultListCache();
    return this.getVaultById(dto.userId, dto.vaultId);
  }

  public async inviteClient(dto: InviteClientDTO): Promise<VaultDTO> {
    const clientEmail = dto.clientEmail.trim().toLowerCase();

    if (isSupabaseConfigured() && supabase) {
      const vault = await dataIsolationService.assertVaultOwnership(dto.freelancerId, dto.vaultId);

      // Find registered client user in Supabase
      const { data: clientUser, error: uErr } = await supabase
        .from("users")
        .select("id, email")
        .eq("email", clientEmail)
        .single();

      if (uErr || !clientUser) {
        throw new NotFoundError(
          `No registered client found with email '${dto.clientEmail}'. Client must register first.`,
          "CLIENT_NOT_FOUND"
        );
      }

      if (clientUser.id === dto.freelancerId) {
        throw new BadRequestError("You cannot invite yourself as the client of your own vault.", "SELF_INVITE_NOT_ALLOWED");
      }

      // Check duplicate invitation
      const { data: existingMembers } = await supabase
        .from("vault_members")
        .select("*")
        .eq("vault_id", dto.vaultId)
        .eq("user_id", clientUser.id);

      if (existingMembers && existingMembers.length > 0) {
        const m = existingMembers[0];
        if (m.invitation_status === "ACCEPTED") {
          throw new ConflictError("This client has already accepted an invitation to this vault.", "ALREADY_ACCEPTED");
        }
        throw new ConflictError("An invitation is already pending for this client.", "INVITATION_ALREADY_EXISTS");
      }

      // Add membership
      const memberId = crypto.randomUUID();
      await supabase.from("vault_members").insert([{
        id: memberId,
        vault_id: dto.vaultId,
        user_id: clientUser.id,
        role: "CLIENT",
        invitation_status: "PENDING",
        invited_by: dto.freelancerId,
        created_at: new Date().toISOString(),
      }]);

      // Transition vault status if DRAFT
      if (vault.status === "DRAFT") {
        VaultStateMachine.assertTransition(vault.status as VaultStatus, "AWAITING_CLIENT");
        await supabase
          .from("vaults")
          .update({
            status: "AWAITING_CLIENT",
            updated_at: new Date().toISOString(),
          })
          .eq("id", dto.vaultId);
      }

      invalidateVaultListCache();
      return this.getVaultById(dto.freelancerId, dto.vaultId);
    }

    database.store.checkFailure();
    const vault = await dataIsolationService.assertVaultOwnership(dto.freelancerId, dto.vaultId);

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

    for (const m of database.store.members.values()) {
      if (m.vault_id === dto.vaultId && m.user_id === clientUser.id) {
        if (m.invitation_status === "ACCEPTED") {
          throw new ConflictError("This client has already accepted an invitation to this vault.", "ALREADY_ACCEPTED");
        }
        throw new ConflictError("An invitation is already pending for this client.", "INVITATION_ALREADY_EXISTS");
      }
    }

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

    if (vault.status === "DRAFT") {
      VaultStateMachine.assertTransition(vault.status as VaultStatus, "AWAITING_CLIENT");
      vault.status = "AWAITING_CLIENT";
      vault.updated_at = new Date();
    }

    invalidateVaultListCache();
    return this.getVaultById(dto.freelancerId, dto.vaultId);
  }

  public async acceptInvite(dto: AcceptInviteDTO): Promise<VaultDTO> {
    if (isSupabaseConfigured() && supabase) {
      const { data: vault, error: vErr } = await supabase
        .from("vaults")
        .select("*")
        .eq("id", dto.vaultId)
        .single();

      if (vErr || !vault) {
        throw new NotFoundError(`Vault '${dto.vaultId}' not found.`, "VAULT_NOT_FOUND");
      }

      const { data: memberRows } = await supabase
        .from("vault_members")
        .select("*")
        .eq("vault_id", dto.vaultId)
        .eq("user_id", dto.clientId);

      const memberRecord = memberRows && memberRows.length > 0 ? memberRows[0] : null;

      if (!memberRecord) {
        throw new ForbiddenError("You have not been invited to this vault.", "NOT_INVITED");
      }

      if (memberRecord.invitation_status === "ACCEPTED") {
        throw new ConflictError("You have already accepted this invitation.", "ALREADY_ACCEPTED");
      }

      if (memberRecord.invitation_status !== "PENDING") {
        throw new BadRequestError(`Invitation is ${memberRecord.invitation_status.toLowerCase()} and cannot be accepted.`, "INVALID_INVITATION_STATUS");
      }

      await supabase
        .from("vault_members")
        .update({
          invitation_status: "ACCEPTED",
          joined_at: new Date().toISOString(),
        })
        .eq("id", memberRecord.id);

      if (vault.status === "AWAITING_CLIENT") {
        VaultStateMachine.assertTransition(vault.status as VaultStatus, "AWAITING_AUTHORIZATION");
        await supabase
          .from("vaults")
          .update({
            status: "AWAITING_AUTHORIZATION",
            updated_at: new Date().toISOString(),
          })
          .eq("id", dto.vaultId);
      }

      invalidateVaultListCache();
      return this.getVaultById(dto.clientId, dto.vaultId);
    }

    database.store.checkFailure();
    const vault = database.store.vaults.get(dto.vaultId);
    if (!vault) {
      throw new NotFoundError(`Vault '${dto.vaultId}' not found.`, "VAULT_NOT_FOUND");
    }

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

    memberRecord.invitation_status = "ACCEPTED";
    memberRecord.joined_at = new Date();

    if (vault.status === "AWAITING_CLIENT") {
      VaultStateMachine.assertTransition(vault.status as VaultStatus, "AWAITING_AUTHORIZATION");
      vault.status = "AWAITING_AUTHORIZATION";
      vault.updated_at = new Date();
    }

    invalidateVaultListCache();
    return this.getVaultById(dto.clientId, dto.vaultId);
  }
}

export const vaultDomainService = new VaultDomainService();
