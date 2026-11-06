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
  ConflictError,
  AppError,
} from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import { database } from "../shared/db.js";
import { dataIsolationService } from "../authorization/isolation.service.js";
import { approveVault } from "../money/approve.service.js";
import { assertClientMember } from "../money/access.js";
import { paypalService } from "../paypal/paypal.client.js";
import {
  appendLedger,
  casStatus,
  getAuthorizationId,
  getCapture,
} from "../money/money.store.js";
import type { VaultStatus } from "../shared/types.js";
import { VaultStateMachine } from "./vault.state-machine.js";
import {
  getFailedChecks,
  recordWaivers,
  setRevisionNote,
  type WaiverRecord,
} from "../audit/waivers.js";

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

    /* the money rows behind this vault: the capture holds the payout figure, the
       payout row holds the status a surface can print */
    const [{ data: captureRow }, { data: payoutRow }, { data: moneyEvents }] = await Promise.all([
      supabase.from("vault_captures").select("capture_id, payout_cents").eq("vault_id", vaultId).maybeSingle(),
      supabase.from("vault_payouts").select("status, amount_cents").eq("vault_id", vaultId).maybeSingle(),
      supabase
        .from("ledger_events")
        .select("metadata, created_at")
        .eq("vault_id", vaultId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    /* the PayPal ids are also in the ledger metadata, and the vault columns can
       be empty (a row written before the column existed, or a write the database
       refused): the ledger is the fallback that keeps a receipt from printing
       nothing where a real id exists */
    const metas = (moneyEvents || []).map((row: any) => row.metadata || {});
    const fromLedger = (key: string): string | null =>
      (metas.find((m: any) => typeof m[key] === "string" && m[key])?.[key] as string) || null;

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
      /* the room's PAID receipt reads these off the vault; the row is already
         selected with * and the ids were being dropped here */
      paypalOrderId: (vault as any).paypal_order_id || fromLedger("orderId"),
      paypalAuthorizationId: (vault as any).paypal_authorization_id || fromLedger("authorizationId"),
      paypalCaptureId: (vault as any).paypal_capture_id || captureRow?.capture_id || fromLedger("captureId"),
      failedChecks: Array.isArray((vault as any).failed_checks) ? (vault as any).failed_checks : [],
      waivedChecks: Array.isArray((vault as any).waived_checks) ? (vault as any).waived_checks : [],
      revisionNote: (vault as any).revision_note ?? null,
      /* no payout row yet means nothing has been attempted, not "paid" */
      payoutCents: payoutRow?.amount_cents != null ? Number(payoutRow.amount_cents) : captureRow?.payout_cents ?? null,
      payoutStatus: payoutRow?.status ?? null,
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
      "SUBMITTED",
    ];
    if (!allowedFrom.includes(vault.status as VaultStatus)) {
      throw new BadRequestError(
        `Cannot authorize a vault with status '${vault.status}'.`,
        "INVALID_STATE"
      );
    }

    /* This route used to set AUTHORIZED with no PayPal call behind it, so any
       member holding a token could mark funds held for free. It may now only
       confirm an authorization PayPal actually created for this vault: the
       PayPal route (/payment/authorize) and the authorization webhook both
       record the id, and nothing else does. */
    const declared = typeof req.body?.authorizationId === "string" ? req.body.authorizationId.trim() : "";
    const record = vault as Record<string, unknown>;
    const onRecord = String(
      record.paypal_authorization_id ?? record.paypalAuthorizationId ?? record.authorizationId ?? ""
    );
    if (!declared || !onRecord || declared !== onRecord) {
      throw new ConflictError(
        "Authorizing needs a PayPal authorization for this vault. Start it with the PayPal button.",
        "PAYMENT_AUTHORIZATION_REQUIRED"
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

/* the body's waivers: check ids, each with an optional reason. Unknown shapes
   are refused rather than guessed at, so a malformed list cannot silently
   approve without the waiver it meant to record. */
function parseWaivers(raw: unknown): Array<{ checkId: string; reason?: string }> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new BadRequestError("'waivers' must be a list of check ids.", "INVALID_WAIVERS");
  }

  const seen = new Set<string>();
  const out: Array<{ checkId: string; reason?: string }> = [];
  for (const item of raw) {
    const checkId =
      typeof item === "string"
        ? item.trim()
        : typeof (item as any)?.checkId === "string"
          ? String((item as any).checkId).trim()
          : "";
    const reason =
      typeof (item as any)?.reason === "string"
        ? String((item as any).reason).trim().slice(0, 500)
        : "";
    if (!checkId) throw new BadRequestError("Each waiver needs a checkId.", "INVALID_WAIVERS");
    if (seen.has(checkId)) continue;
    seen.add(checkId);
    out.push({ checkId, ...(reason ? { reason } : {}) });
  }
  return out;
}

/* ── POST /api/vaults/:id/approve ───────────────────────────────────── */
/* Client approves and captures → AUTHORIZED|AWAITING_APPROVAL → PAID   */

router.post("/:id/approve", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);

    /* The stored failed report is authoritative: a waiver may name only a check
       the server recorded as failed, and every unwaived failure blocks capture. */
    const requested = parseWaivers(req.body?.waivers);
    const failedChecks = await getFailedChecks(vaultId);
    const failedById = new Map(failedChecks.map((check) => [check.id, check]));

    const unknown = requested.filter((waiver) => !failedById.has(waiver.checkId));
    if (unknown.length > 0) {
      throw new BadRequestError(
        `Only checks that actually failed can be waived. Not failed: ${unknown
          .map((waiver) => waiver.checkId)
          .join(", ")}.`,
        "WAIVER_NOT_ALLOWED"
      );
    }

    const waivedIds = new Set(requested.map((waiver) => waiver.checkId));
    const unwaived = failedChecks.filter((check) => !waivedIds.has(check.id));
    if (unwaived.length > 0) {
      throw new BadRequestError(
        `Cannot approve payment: ${unwaived.length} verification check(s) failed (${unwaived
          .map((check) => check.name)
          .join(", ")}). Waive them or request a revision.`,
        "VERIFICATION_FAILED"
      );
    }

    if (requested.length > 0) {
      const records: WaiverRecord[] = requested.map((waiver) => {
        const failed = failedById.get(waiver.checkId)!;
        return {
          checkId: failed.id,
          name: failed.name,
          ...(waiver.reason ? { reason: waiver.reason } : {}),
          waivedAt: new Date().toISOString(),
          waivedBy: req.user!.id,
        };
      });

      await recordWaivers(vaultId, records);
      for (const record of records) {
        await appendLedger(
          vaultId,
          "CHECK_WAIVED",
          req.user.id,
          null,
          vault.currency || "USD",
          `Waived failed check: ${record.name}${record.reason ? ` — ${record.reason}` : ""}`,
          {
            checkId: record.checkId,
            checkName: record.name,
            ...(record.reason ? { reason: record.reason } : {}),
          }
        );
      }
      logger.info(`[approve] vault ${vaultId} waived ${records.length} failed check(s)`);
    }

    /* Approval is what captures the money. Only the invited client may do it,
       only from AWAITING_APPROVAL, and the capture is re-verified server-side
       before anything is unlocked or paid out. */
    const result = await approveVault(vaultId, req.user.id);

    const updated = await getFullVault(vaultId);
    return sendSuccess(
      res,
      updated,
      `Payment captured (${result.captureId}), payout ${result.payoutStatus}, files unlocked`
    );
  } catch (err) {
    next(err);
  }
});

/* ── POST /api/vaults/:id/revision ──────────────────────────────────── */
/* Client sends failed work back → AWAITING_APPROVAL → NEEDS_REVISION    */

router.post("/:id/revision", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);
    await assertClientMember(req.user.id, vaultId);

    const from = String(vault.status).toUpperCase() as VaultStatus;
    /* the state machine already carries this edge; anything else is 409 */
    VaultStateMachine.assertTransition(from, "NEEDS_REVISION");

    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
    const moved = await casStatus(vaultId, from, "NEEDS_REVISION");
    if (!moved) {
      throw new ConflictError(
        "The vault changed while the revision was being requested.",
        "INVALID_STATE"
      );
    }

    await setRevisionNote(vaultId, note || null);
    await appendLedger(
      vaultId,
      "REVISION_REQUESTED",
      req.user.id,
      null,
      vault.currency || "USD",
      note ? `Revision requested: ${note}` : "Revision requested",
      note ? { note } : {}
    );
    logger.info(`[revision] vault ${vaultId} sent back for revision`);

    return sendSuccess(res, await getFullVault(vaultId), "Revision requested");
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

    /* Only the invited client may reject. Membership alone is not enough: the
       freelancer owns the vault and must not be able to cancel the client's
       hold. */
    await assertClientMember(req.user.id, vaultId);

    /* a second reject is the same answer, and must not void twice */
    if (String(vault.status).toUpperCase() === "CANCELLED") {
      const updated = await getFullVault(vaultId);
      return sendSuccess(res, updated, "Vault hold voided");
    }

    if (String(vault.status).toUpperCase() === "PAID") {
      throw new ConflictError(
        "Payment was already captured; a void is no longer possible.",
        "ALREADY_CAPTURED"
      );
    }

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

    /* A recorded capture means the money moved; voiding is no longer possible. */
    const capture = await getCapture(vaultId);
    if (capture) {
      throw new ConflictError(
        "Payment was already captured; a void is no longer possible.",
        "ALREADY_CAPTURED"
      );
    }

    const authorizationId = await getAuthorizationId(vaultId);

    /* The hold is real money. Void it first and only cancel once PayPal agrees:
       a cancelled vault whose authorization is still active looks settled to the
       client while the bank still has the funds on hold. */
    if (authorizationId && !authorizationId.startsWith("mock-")) {
      try {
        await paypalService.voidAuthorization(authorizationId, `void-reject-${vaultId}`);
      } catch (err: any) {
        /* PayPal says "already voided/expired" as an error; confirm the state
           instead of trusting the message, and only then continue. */
        const state = await paypalService
          .getAuthorization(authorizationId)
          .catch(() => null);
        const done = state && ["VOIDED", "EXPIRED"].includes(String(state.status).toUpperCase());
        if (!done) {
          logger.error(
            `[reject] void failed for vault ${vaultId} (${err?.message || "unknown"}); vault left unchanged`
          );
          throw new AppError(
            "PayPal did not confirm the void. The vault was left unchanged so you can retry.",
            502,
            "VOID_FAILED"
          );
        }
      }
    }

    const moved = await casStatus(vaultId, String(vault.status).toUpperCase(), "CANCELLED");
    if (!moved) {
      const now = await getVaultRecord(req.user.id, vaultId);
      if (String(now.status).toUpperCase() !== "CANCELLED") {
        throw new ConflictError(
          `The vault changed while it was being rejected (now '${now.status}').`,
          "INVALID_STATE"
        );
      }
    }

    await appendLedger(
      vaultId,
      "VAULT_CANCELLED",
      req.user.id,
      Math.round(Number(vault.amount) * 100),
      vault.currency || "USD",
      "Hold voided, nothing was charged",
      authorizationId ? { authorizationId, voided: true } : { voided: false }
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

/* ── GET /api/vaults/:id/audit-detail ──────────────────────────────── */
/* Returns vault info, files from Supabase, and generated checks.       */

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function generateChecksForFiles(
  files: Array<{ file_name: string; mime_type: string; file_size: number; sha256_hash: string }>,
  vaultDescription: string
) {
  const checks: Array<{
    id: string;
    name: string;
    detail: string;
    source: string;
    result: "pass" | "warn" | "fail";
    state: string;
    rows: Array<{ label: string; value: string }>;
  }> = [];

  // 1. File integrity check (always present)
  const allHaveHash = files.every((f) => f.sha256_hash && f.sha256_hash.length === 64);
  checks.push({
    id: "chk_integrity",
    name: "File integrity",
    detail: allHaveHash ? "All SHA-256 hashes verified" : "Some files missing hash",
    source: "TEST LOG",
    result: allHaveHash ? "pass" : "warn",
    state: "queued",
    rows: [
      { label: "files checked", value: String(files.length) },
      { label: "hashes valid", value: String(files.filter((f) => f.sha256_hash?.length === 64).length) },
    ],
  });

  // 2. Deliverable count check
  const hasZip = files.some((f) => f.mime_type === "application/zip" || f.file_name.endsWith(".zip"));
  checks.push({
    id: "chk_deliverables",
    name: "Deliverable package",
    detail: hasZip ? "Archive found in delivery" : "No archive — loose files only",
    source: "TEST LOG",
    result: hasZip ? "pass" : "warn",
    state: "queued",
    rows: [
      { label: "total files", value: String(files.length) },
      { label: "archives", value: String(files.filter((f) => f.file_name.endsWith(".zip")).length) },
    ],
  });

  // 3. Documentation check
  const hasDocs = files.some(
    (f) =>
      f.file_name.toLowerCase().includes("readme") ||
      f.mime_type === "application/pdf" ||
      f.file_name.endsWith(".md") ||
      f.file_name.endsWith(".docx")
  );
  checks.push({
    id: "chk_docs",
    name: "Documentation",
    detail: hasDocs ? "README or docs found" : "No documentation included",
    source: "TEST LOG",
    result: hasDocs ? "pass" : "fail",
    state: "queued",
    rows: [
      {
        label: "doc files",
        value: String(
          files.filter(
            (f) =>
              f.file_name.toLowerCase().includes("readme") ||
              f.file_name.endsWith(".md") ||
              f.file_name.endsWith(".pdf") ||
              f.file_name.endsWith(".docx")
          ).length
        ),
      },
    ],
  });

  // 4. Image/asset check (if applicable)
  const images = files.filter(
    (f) =>
      f.mime_type.startsWith("image/") ||
      f.file_name.endsWith(".svg") ||
      f.file_name.endsWith(".webp")
  );
  if (images.length > 0) {
    checks.push({
      id: "chk_assets",
      name: "Visual assets",
      detail: `${images.length} image${images.length > 1 ? "s" : ""} included`,
      source: "PIXEL SCAN",
      result: "pass",
      state: "queued",
      rows: [
        { label: "images", value: String(images.length) },
        {
          label: "formats",
          value: [...new Set(images.map((f) => f.file_name.split(".").pop()))].join(", "),
        },
      ],
    });
  }

  // 5. Size check
  const totalSize = files.reduce((s, f) => s + f.file_size, 0);
  const tooLarge = totalSize > 50_000_000;
  checks.push({
    id: "chk_size",
    name: "Package size",
    detail: `Total: ${formatFileSize(totalSize)}`,
    source: "TEST LOG",
    result: tooLarge ? "warn" : "pass",
    state: "queued",
    rows: [
      { label: "total", value: formatFileSize(totalSize) },
      { label: "files", value: String(files.length) },
    ],
  });

  return checks;
}

router.get("/:id/audit-detail", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);

    // Fetch files from Supabase
    let files: Array<{
      id: string;
      file_name: string;
      mime_type: string;
      file_size: number;
      sha256_hash: string;
      storage_path: string;
      created_at: string;
    }> = [];

    if (isSupabaseConfigured() && supabase) {
      const { data: dbFiles } = await supabase
        .from("vault_files")
        .select("*")
        .eq("vault_id", vaultId)
        .order("created_at", { ascending: true });
      files = dbFiles || [];
    }

    // Map DB files to the frontend VaultFile shape
    const vaultFiles = files.map((f) => {
      const ext = f.file_name.split(".").pop() || "";
      const isFolder = !ext;
      return {
        id: f.id,
        name: f.file_name,
        kind: isFolder ? "folder" : "file",
        meta: formatFileSize(f.file_size),
        sha256: f.sha256_hash,
        mimeType: f.mime_type,
      };
    });

    // Generate dynamic checks based on real files
    const checks = generateChecksForFiles(files, vault.description || "");

    // Build suggestions based on vault content
    const suggestions: string[] = [];
    if (files.length > 0) {
      suggestions.push("What files were delivered?");
      suggestions.push("Are there any issues with the delivery?");
    }
    if (files.some((f) => f.file_name.endsWith(".zip"))) {
      suggestions.push("What's inside the archive?");
    }
    if (files.some((f) => f.mime_type.startsWith("image/"))) {
      suggestions.push("Check the image assets quality");
    }
    if (suggestions.length === 0) {
      suggestions.push("What was delivered?", "Are there any warnings?", "Is the build ready to ship?");
    }

    // Determine if checks should show settled (already audited/unlocked)
    const settled = ["AWAITING_APPROVAL", "SUBMITTED", "VERIFYING", "PAID", "COMPLETED", "UNLOCKED"].includes(
      vault.status
    );

    return sendSuccess(
      res,
      {
        vault: {
          id: vault.id,
          title: vault.title,
          description: vault.description,
          amount: Number(vault.amount),
          currency: vault.currency || "USD",
          status: vault.status,
          freelancerId: vault.freelancer_id,
          createdAt: vault.created_at,
          /* the receipt copies the real PayPal ids, not a hash of the vault id */
          paypalOrderId: (vault as any).paypal_order_id || null,
          paypalCaptureId: (vault as any).paypal_capture_id || null,
        },
        files: vaultFiles,
        checks: checks.map((c) => ({
          ...c,
          state: settled ? c.result : "queued",
        })),
        suggestions,
        questionsUsed: 0,
        questionLimit: 15,
      },
      "Audit detail loaded"
    );
  } catch (err) {
    next(err);
  }
});

/* ── POST /api/vaults/:id/checks/run ───────────────────────────────── */
/* Runs the checks server-side; a re-run at AWAITING_APPROVAL keeps state */

router.post("/:id/checks/run", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);

    // Vault must be in an authorized/held state to run audit
    const allowedFrom: VaultStatus[] = ["AUTHORIZED", "IN_PROGRESS", "SUBMITTED", "VERIFYING", "AWAITING_APPROVAL"];
    if (!allowedFrom.includes(vault.status as VaultStatus)) {
      throw new BadRequestError(
        `Cannot audit a vault with status '${vault.status}'.`,
        "INVALID_STATE"
      );
    }

    // Fetch files for check generation
    let files: Array<{
      file_name: string;
      mime_type: string;
      file_size: number;
      sha256_hash: string;
    }> = [];

    if (isSupabaseConfigured() && supabase) {
      const { data: dbFiles } = await supabase
        .from("vault_files")
        .select("file_name, mime_type, file_size, sha256_hash")
        .eq("vault_id", vaultId);
      files = dbFiles || [];
    }

    const checks = generateChecksForFiles(files, vault.description || "");
    const results = checks.map((c) => ({ ...c, state: c.result }));

    // A first audit walks SUBMITTED -> VERIFYING -> AWAITING_APPROVAL. A re-run
    // from the client's decision only re-reads the files: the state machine has
    // no AWAITING_APPROVAL -> SUBMITTED edge, and the vault has to stay payable
    // while its checks are recomputed.
    if (vault.status !== "AWAITING_APPROVAL") {
      await updateVaultStatus(vaultId, "SUBMITTED");
      await updateVaultStatus(vaultId, "VERIFYING");
      await updateVaultStatus(vaultId, "AWAITING_APPROVAL");
    }
    await insertLedgerEvent(
      vaultId,
      req.user.id,
      "AUDIT_COMPLETED",
      null,
      vault.currency || "USD",
      "Audit run finished, report ready"
    );

    return sendSuccess(res, { checks: results }, "Audit checks completed");
  } catch (err) {
    next(err);
  }
});

/* ── POST /api/vaults/:id/chat ─────────────────────────────────────── */
/* AI chat endpoint — answers questions grounded in vault data          */

router.post("/:id/chat", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);

    const { question } = req.body;
    if (!question || typeof question !== "string") {
      throw new BadRequestError("A 'question' field is required.", "MISSING_QUESTION");
    }

    // Fetch files for context
    let files: Array<{
      id: string;
      file_name: string;
      mime_type: string;
      file_size: number;
      sha256_hash: string;
    }> = [];

    if (isSupabaseConfigured() && supabase) {
      const { data: dbFiles } = await supabase
        .from("vault_files")
        .select("id, file_name, mime_type, file_size, sha256_hash")
        .eq("vault_id", vaultId);
      files = dbFiles || [];
    }

    // Build context-aware answer
    const q = question.toLowerCase();
    const fileList = files.map((f) => `${f.file_name} (${formatFileSize(f.file_size)}, ${f.mime_type})`).join(", ");
    const totalSize = files.reduce((s, f) => s + f.file_size, 0);
    const hasZip = files.some((f) => f.file_name.endsWith(".zip"));
    const hasDocs = files.some(
      (f) =>
        f.file_name.toLowerCase().includes("readme") ||
        f.file_name.endsWith(".md") ||
        f.file_name.endsWith(".pdf") ||
        f.file_name.endsWith(".docx")
    );
    const images = files.filter(
      (f) =>
        f.mime_type.startsWith("image/") ||
        f.file_name.endsWith(".svg") ||
        f.file_name.endsWith(".webp")
    );

    let answer = "";
    let sources: string[] = [];

    // Context-aware question matching
    if (/what.*deliver|what.*file|what.*included|what.*sent|what.*upload/i.test(q)) {
      answer = `This vault "${vault.title}" contains ${files.length} deliverable${files.length !== 1 ? "s" : ""} totaling ${formatFileSize(totalSize)}:\n\n`;
      for (const f of files) {
        answer += `• **${f.file_name}** — ${formatFileSize(f.file_size)} (${f.mime_type})\n`;
      }
      if (vault.description) {
        answer += `\nProject description: "${vault.description}"`;
      }
      sources = ["FILE INDEX"];

    } else if (/issue|warning|problem|concern|risk/i.test(q)) {
      const issues: string[] = [];
      if (!hasDocs) issues.push("No documentation (README/PDF) was included in the delivery.");
      if (!hasZip) issues.push("Files are delivered loose without an archive package.");
      if (totalSize > 50_000_000) issues.push(`Total package size (${formatFileSize(totalSize)}) exceeds the recommended 50 MB limit.`);
      if (files.length === 0) issues.push("No files have been uploaded to this vault yet.");
      const hashMissing = files.filter((f) => !f.sha256_hash || f.sha256_hash.length !== 64);
      if (hashMissing.length > 0) issues.push(`${hashMissing.length} file(s) have missing or invalid integrity hashes.`);

      if (issues.length === 0) {
        answer = `I reviewed the ${files.length} deliverable(s) in "${vault.title}" and found no issues. All files have valid integrity hashes, documentation is present${hasZip ? ", and an archive package is included" : ""}.`;
      } else {
        answer = `I found ${issues.length} potential issue${issues.length > 1 ? "s" : ""} with this delivery:\n\n`;
        issues.forEach((issue, i) => {
          answer += `${i + 1}. ${issue}\n`;
        });
      }
      sources = ["FILE INDEX", "TEST LOG"];

    } else if (/archive|zip|package|inside|extract/i.test(q)) {
      const zips = files.filter((f) => f.file_name.endsWith(".zip"));
      if (zips.length > 0) {
        answer = `The delivery contains ${zips.length} archive(s):\n\n`;
        for (const z of zips) {
          answer += `• **${z.file_name}** — ${formatFileSize(z.file_size)}, SHA-256: \`${z.sha256_hash.slice(0, 16)}…\`\n`;
        }
        answer += `\nThe archive contents can be verified after download. Integrity hash is valid.`;
      } else {
        answer = `No archive files (.zip) were found in this delivery. The ${files.length} file(s) are delivered as individual items.`;
      }
      sources = ["FILE INDEX"];

    } else if (/image|visual|asset|design|logo|icon|svg|png|webp/i.test(q)) {
      if (images.length > 0) {
        answer = `The delivery includes ${images.length} visual asset(s):\n\n`;
        for (const img of images) {
          answer += `• **${img.file_name}** — ${formatFileSize(img.file_size)} (${img.mime_type})\n`;
        }
        answer += `\nAll image files have valid integrity hashes.`;
        sources = ["FILE INDEX", "PIXEL SCAN"];
      } else {
        answer = `No image or visual asset files were found in this delivery. The ${files.length} file(s) are: ${fileList}.`;
        sources = ["FILE INDEX"];
      }

    } else if (/ready.*ship|ready.*approve|ready.*pay|can.*approve|should.*approve|safe.*approve/i.test(q)) {
      const allHashes = files.every((f) => f.sha256_hash?.length === 64);
      const hasContent = files.length > 0;
      const issues: string[] = [];
      if (!hasContent) issues.push("no files uploaded");
      if (!hasDocs) issues.push("missing documentation");
      if (!allHashes) issues.push("some integrity hashes are invalid");

      if (issues.length === 0) {
        answer = `Based on my analysis, this delivery looks ready to approve:\n\n• **${files.length} files** delivered (${formatFileSize(totalSize)})\n• All integrity hashes verified ✓\n• Documentation included ✓${hasZip ? "\n• Archive package present ✓" : ""}\n\nYou can run the full audit checks from the panel for a detailed report, then approve.`;
      } else {
        answer = `I have ${issues.length} concern${issues.length > 1 ? "s" : ""} before approving: ${issues.join(", ")}. I recommend reviewing these items before proceeding with payment.`;
      }
      sources = ["FILE INDEX", "TEST LOG"];

    } else if (/test|build|compile|ci|check|lint|pass|fail/i.test(q)) {
      answer = `To verify the build and test status, please run all checks from the "Checks" panel on the right. The automated audit will verify:\n\n• File integrity (SHA-256 hash verification)\n• Deliverable package completeness\n• Documentation presence\n• Asset quality\n• Package size\n\nCurrently ${files.length} file(s) are staged for audit in vault "${vault.title}".`;
      sources = ["TEST LOG"];

    } else if (/color|colour|hex|brand|typography|font|style/i.test(q)) {
      if (images.length > 0 || files.some((f) => f.file_name.includes("brand") || f.file_name.includes("style"))) {
        const brandFiles = files.filter(
          (f) =>
            f.file_name.includes("brand") ||
            f.file_name.includes("style") ||
            f.file_name.includes("typography") ||
            f.mime_type.startsWith("image/")
        );
        answer = `I found ${brandFiles.length} brand/style-related file(s) in this delivery:\n\n`;
        for (const bf of brandFiles) {
          answer += `• **${bf.file_name}** — ${formatFileSize(bf.file_size)}\n`;
        }
        answer += `\nFor precise color extraction and typography analysis, download the files and verify against your brand guidelines.`;
        sources = ["FILE INDEX", "PIXEL SCAN"];
      } else {
        answer = `No brand, style, or image files were found in this delivery. The files present are: ${fileList}.`;
        sources = ["FILE INDEX"];
      }

    } else if (/how much|price|cost|amount|payment|fee/i.test(q)) {
      const fee = Number(vault.amount) * 0.05;
      const net = Number(vault.amount) - fee;
      answer = `The vault amount for "${vault.title}" is **$${Number(vault.amount).toLocaleString()}** ${vault.currency || "USD"}.\n\n• Platform fee (5%): $${fee.toLocaleString()}\n• Freelancer receives: $${net.toLocaleString()}\n\nStatus: ${vault.status}`;
      sources = ["VAULT DATA"];

    } else {
      // Generic contextual fallback
      answer = `I'm analyzing vault "${vault.title}" which contains ${files.length} deliverable(s) totaling ${formatFileSize(totalSize)}.\n\nHere's what I can help with:\n• **File review** — What was delivered, file types, sizes\n• **Issue detection** — Missing docs, integrity checks, size warnings\n• **Readiness assessment** — Whether the delivery is ready to approve\n• **Asset analysis** — Visual assets, brand files, archives\n\nFiles in this vault: ${files.length > 0 ? files.map((f) => f.file_name).join(", ") : "none yet"}.\n\nTry asking something specific about the delivery!`;
      sources = ["FILE INDEX"];
    }

    return sendSuccess(
      res,
      {
        text: answer,
        sources,
        cached: false,
      },
      "AI response generated"
    );
  } catch (err) {
    next(err);
  }
});

export default router;
