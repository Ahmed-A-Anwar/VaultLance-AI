/**
 * vault.actions.ts — Client-facing action endpoints for the vault dashboard.
 *
 * These map the dashboard workflow to the underlying vault state machine
 * and persist every change to Supabase (vaults + ledger_events).
 *
 * POST /api/vaults/:id/authorize  → AWAITING_AUTHORIZATION → AUTHORIZED
 * POST /api/vaults/:id/approve    → AUTHORIZED → PAID  (captures funds)
 * POST /api/vaults/:id/reject     → AUTHORIZED|AWAITING_APPROVAL → CANCELLED
 * POST /api/vaults/:id/audit      → returns audit room route (no status change)
 */

import { Router } from "express";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.middleware.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { sendSuccess } from "../shared/response.js";
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from "../shared/errors.js";
import { database } from "../shared/db.js";
import { dataIsolationService } from "../authorization/isolation.service.js";
import type { VaultStatus } from "../shared/types.js";

const router = Router();
router.use(requireAuth);

/* ── helpers ─────────────────────────────────────────────────────────── */

async function getVaultRecord(userId: string, vaultId: string) {
  if (isSupabaseConfigured() && supabase) {
    // Check the user is a member of this vault (or the owner)
    const { data: vault, error } = await supabase
      .from("vaults")
      .select("*")
      .eq("id", vaultId)
      .single();

    if (error || !vault) {
      throw new NotFoundError("Vault not found.", "VAULT_NOT_FOUND");
    }

    // Check membership
    const { data: members } = await supabase
      .from("vault_members")
      .select("user_id")
      .eq("vault_id", vaultId)
      .eq("user_id", userId);

    const isOwner = vault.freelancer_id === userId;
    const isMember = members && members.length > 0;

    if (!isOwner && !isMember) {
      throw new ForbiddenError(
        "You do not have access to this vault.",
        "ACCESS_DENIED"
      );
    }

    return vault;
  }

  // In-memory fallback
  const { vault } = await dataIsolationService.getVaultIfAuthorized(
    userId,
    vaultId
  );
  return vault;
}

async function updateVaultStatus(vaultId: string, newStatus: VaultStatus) {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from("vaults")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", vaultId);
    if (error) {
      throw new BadRequestError(
        `Failed to update vault: ${error.message}`,
        "UPDATE_FAILED"
      );
    }
  } else {
    const vault = database.store.vaults.get(vaultId);
    if (vault) {
      vault.status = newStatus;
      vault.updated_at = new Date();
    }
  }
}

async function insertLedgerEvent(
  vaultId: string,
  actorId: string,
  eventType: string,
  amount: number | null,
  currency: string,
  note: string
) {
  if (isSupabaseConfigured() && supabase) {
    await supabase.from("ledger_events").insert([
      {
        id: crypto.randomUUID(),
        vault_id: vaultId,
        actor_id: actorId,
        event_type: eventType,
        amount,
        currency,
        metadata: { note },
        created_at: new Date().toISOString(),
      },
    ]);
  }
}

async function getFullVault(vaultId: string) {
  if (isSupabaseConfigured() && supabase) {
    const { data: vault } = await supabase
      .from("vaults")
      .select("*")
      .eq("id", vaultId)
      .single();

    if (!vault) throw new NotFoundError("Vault not found.", "VAULT_NOT_FOUND");

    // Get members
    const { data: memberRows } = await supabase
      .from("vault_members")
      .select("id, vault_id, user_id, role, invitation_status, joined_at, created_at")
      .eq("vault_id", vaultId);

    const members = [];
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
        joinedAt: m.joined_at,
        createdAt: m.created_at,
      });
    }

    return {
      id: vault.id,
      freelancerId: vault.freelancer_id,
      title: vault.title,
      description: vault.description,
      amount: Number(vault.amount),
      currency: vault.currency,
      status: vault.status,
      expiresAt: vault.expires_at,
      createdAt: vault.created_at,
      updatedAt: vault.updated_at,
      members,
    };
  }

  return null;
}

/* ── POST /api/vaults/:id/authorize ─────────────────────────────────── */
/* Client authorizes the payment → AWAITING_AUTHORIZATION → AUTHORIZED  */

router.post("/:id/authorize", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);

    const allowedFrom: VaultStatus[] = [
      "AWAITING_AUTHORIZATION",
      "AWAITING_CLIENT",
      "DRAFT",
    ];
    if (!allowedFrom.includes(vault.status as VaultStatus)) {
      throw new BadRequestError(
        `Cannot authorize a vault with status '${vault.status}'.`,
        "INVALID_STATE"
      );
    }

    await updateVaultStatus(vaultId, "AUTHORIZED");
    await insertLedgerEvent(
      vaultId,
      req.user.id,
      "FUNDS_AUTHORIZED",
      Number(vault.amount),
      vault.currency || "USD",
      "Funds authorized, held in escrow"
    );

    const updated = await getFullVault(vaultId);
    return sendSuccess(res, updated, "Payment authorized successfully");
  } catch (err) {
    next(err);
  }
});

/* ── POST /api/vaults/:id/approve ───────────────────────────────────── */
/* Client approves and captures → AUTHORIZED|AWAITING_APPROVAL → PAID   */

router.post("/:id/approve", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);

    const allowedFrom: VaultStatus[] = [
      "AUTHORIZED",
      "AWAITING_APPROVAL",
      "VERIFYING",
      "SUBMITTED",
      "IN_PROGRESS",
    ];
    if (!allowedFrom.includes(vault.status as VaultStatus)) {
      throw new BadRequestError(
        `Cannot approve a vault with status '${vault.status}'.`,
        "INVALID_STATE"
      );
    }

    await updateVaultStatus(vaultId, "PAID");
    await insertLedgerEvent(
      vaultId,
      req.user.id,
      "PAYMENT_CAPTURED",
      Number(vault.amount),
      vault.currency || "USD",
      "Capture completed, funds moved"
    );
    await insertLedgerEvent(
      vaultId,
      req.user.id,
      "MILESTONE_APPROVED",
      null,
      vault.currency || "USD",
      "Delivery unlocked to the freelancer"
    );

    const updated = await getFullVault(vaultId);
    return sendSuccess(res, updated, "Payment captured and files unlocked");
  } catch (err) {
    next(err);
  }
});

/* ── POST /api/vaults/:id/reject ────────────────────────────────────── */
/* Client voids the hold → AUTHORIZED|AWAITING_APPROVAL → CANCELLED     */

router.post("/:id/reject", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);

    const allowedFrom: VaultStatus[] = [
      "AUTHORIZED",
      "IN_PROGRESS",
      "SUBMITTED",
      "VERIFYING",
      "AWAITING_APPROVAL",
      "AWAITING_AUTHORIZATION",
      "AWAITING_CLIENT",
      "DRAFT",
    ];
    if (!allowedFrom.includes(vault.status as VaultStatus)) {
      throw new BadRequestError(
        `Cannot reject a vault with status '${vault.status}'.`,
        "INVALID_STATE"
      );
    }

    await updateVaultStatus(vaultId, "CANCELLED");
    await insertLedgerEvent(
      vaultId,
      req.user.id,
      "VAULT_CANCELLED",
      Number(vault.amount),
      vault.currency || "USD",
      "Hold voided, nothing was charged"
    );

    const updated = await getFullVault(vaultId);
    return sendSuccess(res, updated, "Vault hold voided");
  } catch (err) {
    next(err);
  }
});

/* ── POST /api/vaults/:id/audit ─────────────────────────────────────── */
/* Returns the route to the audit room (no status change here)           */

router.post("/:id/audit", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    await getVaultRecord(req.user.id, vaultId);

    return sendSuccess(res, { route: `/vault/${vaultId}` }, "Audit room ready");
  } catch (err) {
    next(err);
  }
});

export default router;
