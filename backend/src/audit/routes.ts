/**
 * Audited vault endpoints. Mounted before the legacy action router so these
 * deterministic checks and grounded explanations are the live implementation.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { sendSuccess } from "../shared/response.js";
import { ForbiddenError, NotFoundError, BadRequestError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import { database } from "../shared/db.js";
import { isSupabaseConfigured, supabase } from "../shared/supabaseClient.js";
import { dataIsolationService } from "../authorization/isolation.service.js";
import { getLockedManifest } from "../vaults/submit.routes.js";
import type { VaultStatus } from "../shared/types.js";
import {
  runDeterministicChecks,
  stagingUrlFromText,
  type AuditCheck,
  type AuditFile,
} from "./checks.js";
import { explainAudit, deterministicExplanation, type AuditExplanation } from "./ai.js";
import {
  getQuestionsUsed,
  reserveQuestion,
  QUESTION_LIMIT,
  MAX_QUESTION_CHARS,
} from "./usage.js";
import { appendAuditMessages, listAuditMessages } from "./messages.js";

const router = Router();
router.use(requireAuth);

const reports = new Map<
  string,
  { checks: AuditCheck[]; explanation: AuditExplanation; generatedAt: string }
>();

export function resetAuditReportsForTests(): void {
  reports.clear();
}

async function getVaultRecord(userId: string, vaultId: string): Promise<any> {
  if (isSupabaseConfigured() && supabase) {
    const { data: vault, error } = await supabase.from("vaults").select("*").eq("id", vaultId).single();
    if (error || !vault) throw new NotFoundError("Vault not found.", "VAULT_NOT_FOUND");
    const { data: members } = await supabase
      .from("vault_members")
      .select("user_id")
      .eq("vault_id", vaultId)
      .eq("user_id", userId);
    if (vault.freelancer_id !== userId && !(members && members.length > 0)) {
      throw new ForbiddenError("You do not have access to this vault.", "ACCESS_DENIED");
    }
    return vault;
  }
  const { vault } = await dataIsolationService.getVaultIfAuthorized(userId, vaultId);
  if (!vault) throw new NotFoundError("Vault not found.", "VAULT_NOT_FOUND");
  return vault;
}

async function loadFiles(vaultId: string): Promise<AuditFile[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from("vault_files").select("*").eq("vault_id", vaultId);
    return (data || []).map((f: any) => ({
      id: String(f.id),
      name: String(f.file_name),
      mimeType: String(f.mime_type || "application/octet-stream"),
      size: Number(f.file_size || 0),
      sha256: String(f.sha256_hash || ""),
      storagePath: f.storage_path ? String(f.storage_path) : undefined,
    }));
  }
  return Array.from(database.store.files.values())
    .filter((f) => f.vault_id === vaultId)
    .map((f) => ({
      id: f.id,
      name: f.file_name,
      mimeType: f.mime_type,
      size: Number(f.file_size),
      sha256: f.sha256_hash,
      storagePath: f.storage_path,
    }));
}

async function runChecks(
  vaultId: string,
  vault: any,
  requestedStagingUrl?: unknown
): Promise<{ checks: AuditCheck[]; manifest: Awaited<ReturnType<typeof getLockedManifest>> }> {
  const files = await loadFiles(vaultId);
  const manifest = await getLockedManifest(vaultId);
  const stagingUrl =
    typeof requestedStagingUrl === "string"
      ? requestedStagingUrl
      : stagingUrlFromText(vault?.description);
  const run = await runDeterministicChecks({
    vaultId,
    files,
    manifest,
    stagingUrl,
  });
  return { checks: run.checks, manifest };
}

async function setStatus(vaultId: string, status: VaultStatus): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from("vaults")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", vaultId);
    if (error) throw new BadRequestError(`Failed to update vault: ${error.message}`, "UPDATE_FAILED");
    return;
  }
  const local = database.store.vaults.get(vaultId);
  if (local) {
    local.status = status;
    local.updated_at = new Date();
  }
}

function fileMeta(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

router.get("/:id/audit-detail", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);
    const files = await loadFiles(vaultId);
    const { checks } = await runChecks(vaultId, vault);
    const messages = await listAuditMessages(vaultId);
    const settled = ["AWAITING_APPROVAL", "SUBMITTED", "VERIFYING", "PAID", "COMPLETED", "UNLOCKED"].includes(
      String(vault.status)
    );
    const suggestions = [
      "What files were delivered?",
      "Are there any issues with the delivery?",
      files.some((f) => /\.zip$/i.test(f.name)) ? "What's inside the archive?" : "Is the build ready to ship?",
    ];
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
          paypalOrderId: vault.paypal_order_id || null,
          paypalCaptureId: vault.paypal_capture_id || null,
        },
        files: files.map((f) => ({
          id: f.id,
          name: f.name,
          kind: "file",
          meta: fileMeta(f.size),
          sha256: f.sha256,
          mimeType: f.mimeType,
        })),
        checks: checks.map((c) => ({ ...c, state: settled ? c.result : "queued" })),
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          sources: m.sources,
          cached: m.cached,
          createdAt: m.createdAt,
        })),
        suggestions,
        questionsUsed: await getQuestionsUsed(vaultId),
        questionLimit: QUESTION_LIMIT,
      },
      "Audit detail loaded"
    );
  } catch (err) {
    next(err);
  }
});

router.post("/:id/checks/run", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);
    const allowed: VaultStatus[] = ["AUTHORIZED", "IN_PROGRESS", "SUBMITTED", "VERIFYING", "AWAITING_APPROVAL"];
    if (!allowed.includes(vault.status as VaultStatus)) {
      throw new BadRequestError(`Cannot audit a vault with status '${vault.status}'.`, "INVALID_STATE");
    }

    const { checks } = await runChecks(vaultId, vault, req.body?.stagingUrl);
    const explanation = (await explainAudit(vaultId, checks)) || deterministicExplanation(checks);
    const results = checks.map((c) => ({ ...c, state: c.result }));
    reports.set(vaultId, { checks: results, explanation, generatedAt: new Date().toISOString() });

    if (vault.status !== "AWAITING_APPROVAL") {
      await setStatus(vaultId, "SUBMITTED");
      await setStatus(vaultId, "VERIFYING");
      await setStatus(vaultId, "AWAITING_APPROVAL");
    }
    logger.info(`[audit] vault ${vaultId} ran ${checks.length} deterministic checks`);

    return sendSuccess(
      res,
      {
        checks: results,
        report: explanation.text,
        sources: explanation.sources,
        cached: explanation.cached,
        ai: explanation.ai,
        provider: explanation.provider || null,
        questionsUsed: await getQuestionsUsed(vaultId),
        questionLimit: QUESTION_LIMIT,
      },
      "Audit checks completed"
    );
  } catch (err) {
    next(err);
  }
});

router.get("/:id/report", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);
    let stored = reports.get(vaultId);
    if (!stored) {
      const { checks } = await runChecks(vaultId, vault);
      const explanation = (await explainAudit(vaultId, checks)) || deterministicExplanation(checks);
      stored = {
        checks: checks.map((c) => ({ ...c, state: c.result })),
        explanation,
        generatedAt: new Date().toISOString(),
      };
      reports.set(vaultId, stored);
    }
    if (!stored) throw new NotFoundError("Audit report unavailable.", "REPORT_UNAVAILABLE");
    return sendSuccess(
      res,
      {
        report: stored.explanation.text,
        checks: stored.checks,
        sources: stored.explanation.sources,
        cached: stored.explanation.cached,
        ai: stored.explanation.ai,
        provider: stored.explanation.provider || null,
        generatedAt: stored.generatedAt,
      },
      "Audit report loaded"
    );
  } catch (err) {
    next(err);
  }
});

router.post("/:id/chat", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);
    const vault = await getVaultRecord(req.user.id, vaultId);
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) throw new BadRequestError("A 'question' field is required.", "MISSING_QUESTION");
    if (question.length > MAX_QUESTION_CHARS) {
      throw new BadRequestError(`Questions are limited to ${MAX_QUESTION_CHARS} characters.`, "QUESTION_TOO_LONG");
    }

    const questionsUsed = await reserveQuestion(vaultId, req.user.id);
    let stored = reports.get(vaultId);
    if (!stored) {
      const { checks } = await runChecks(vaultId, vault);
      stored = {
        checks: checks.map((c) => ({ ...c, state: c.result })),
        explanation: deterministicExplanation(checks),
        generatedAt: new Date().toISOString(),
      };
      reports.set(vaultId, stored);
    }
    if (!stored) throw new NotFoundError("Audit report unavailable.", "REPORT_UNAVAILABLE");

    const explanation =
      (await explainAudit(vaultId, stored.checks, question)) ||
      deterministicExplanation(stored.checks, question);

    /* the room can be left and reopened: keep the turn, not just the count */
    await appendAuditMessages(vaultId, [
      { userId: req.user.id, role: "user", text: question, sources: [], cached: false },
      {
        userId: req.user.id,
        role: "ai",
        text: explanation.text,
        sources: explanation.sources,
        cached: explanation.cached,
      },
    ]);

    return sendSuccess(
      res,
      {
        text: explanation.text,
        sources: explanation.sources,
        cached: explanation.cached,
        ai: explanation.ai,
        provider: explanation.provider || null,
        questionsUsed,
        questionLimit: QUESTION_LIMIT,
      },
      "AI response generated"
    );
  } catch (err) {
    next(err);
  }
});

export default router;
