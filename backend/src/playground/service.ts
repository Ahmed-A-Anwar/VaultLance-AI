/**
 * service.ts — the playground's real workflow, not a demo mode.
 *
 * A reserved pair of accounts owns one playground vault. Loading a sample puts
 * real files in storage, locks a real manifest and runs the deterministic
 * checks; funding goes through the normal PayPal order/reconcile routes; reset
 * deletes only rows whose vault is marked playground and whose every member is
 * one of the two reserved accounts.
 */
import crypto from "crypto";
import path from "path";
import { database } from "../shared/db.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { storageAdapter } from "../uploads/storage.adapter.js";
import { uploadService } from "../uploads/upload.service.js";
import { manifestService } from "../manifests/manifest.service.js";
import { runVaultChecks } from "../audit/run.js";
import { recordFailedChecks, getFailedChecks } from "../audit/waivers.js";
import { appendLedger, memory } from "../money/money.store.js";
import { paypalService } from "../paypal/paypal.client.js";
import { manifestMemory } from "../vaults/submit.routes.js";
import { getLockedManifest } from "../vaults/submit.routes.js";
import { vaultDomainService } from "../vaults/vault.domain-service.js";
import { authService } from "../auth/auth.service.js";
import { DatabaseError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import type { AuditCheck } from "../audit/checks.js";
import { ensurePlaygroundAccounts, type PlaygroundAccount } from "./accounts.js";
import { readSampleFiles, sampleDescription, sampleLabel, type SampleKind } from "./samples.js";

const LIVE = () => isSupabaseConfigured() && supabase !== null;
const PLAYGROUND_AMOUNT = 25;

export interface PlaygroundAccounts {
  freelancer: PlaygroundAccount;
  client: PlaygroundAccount;
}

interface VaultRow {
  id: string;
  status: string;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  freelancer_id: string;
  is_playground?: boolean;
  playground_sample?: string | null;
}

async function latestVault(accounts: PlaygroundAccounts): Promise<VaultRow | null> {
  if (LIVE()) {
    const { data, error } = await supabase!
      .from("vaults")
      .select("id, status, title, description, amount, currency, freelancer_id, is_playground, playground_sample")
      .eq("is_playground", true)
      .eq("freelancer_id", accounts.freelancer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new DatabaseError(`Could not read the playground vault: ${error.message}`);
    return (data as VaultRow | null) ?? null;
  }

  const rows = [...database.store.vaults.values()].filter(
    (vault) => vault.is_playground && vault.freelancer_id === accounts.freelancer.id
  );
  rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return rows[0]
    ? {
        id: rows[0].id,
        status: String(rows[0].status),
        title: rows[0].title,
        description: rows[0].description ?? null,
        amount: Number(rows[0].amount),
        currency: rows[0].currency,
        freelancer_id: rows[0].freelancer_id,
        is_playground: true,
        playground_sample: rows[0].playground_sample ?? null,
      }
    : null;
}

async function markVault(vaultId: string, sample: string | null): Promise<void> {
  if (LIVE()) {
    const { error } = await supabase!
      .from("vaults")
      .update({ is_playground: true, playground_sample: sample })
      .eq("id", vaultId);
    if (error) throw new DatabaseError(`Could not mark the playground vault: ${error.message}`);
    return;
  }
  const vault = database.store.vaults.get(vaultId);
  if (vault) {
    vault.is_playground = true;
    vault.playground_sample = sample;
  }
}

async function writeManifest(
  vaultId: string,
  userId: string,
  manifest: { manifestHash: string; totalFiles: number; totalSizeBytes: number; canonicalString: string }
): Promise<void> {
  if (LIVE()) {
    const { error } = await supabase!.from("vault_manifests").insert([
      {
        vault_id: vaultId,
        manifest_sha256: manifest.manifestHash,
        file_count: manifest.totalFiles,
        total_size_bytes: manifest.totalSizeBytes,
        canonical_json: manifest.canonicalString,
        locked_by: userId,
        locked_at: new Date().toISOString(),
        version: 1,
      },
    ]);
    if (error) throw new DatabaseError(`Could not lock the sample manifest: ${error.message}`);
    return;
  }
  manifestMemory.manifests.set(vaultId, {
    sha: manifest.manifestHash,
    fileCount: manifest.totalFiles,
    totalSizeBytes: manifest.totalSizeBytes,
    version: 1,
  });
}

async function createVault(accounts: PlaygroundAccounts, title: string, description: string): Promise<string> {
  const vault = await vaultDomainService.createVault({
    freelancerId: accounts.freelancer.id,
    title,
    description,
    amount: PLAYGROUND_AMOUNT,
    currency: "USD",
  });

  await markVault(vault.id, null);

  await vaultDomainService.inviteClient({
    freelancerId: accounts.freelancer.id,
    vaultId: vault.id,
    clientEmail: accounts.client.email,
  });
  await vaultDomainService.acceptInvite({ clientId: accounts.client.id, vaultId: vault.id });
  return vault.id;
}

async function seedSample(kind: SampleKind, accounts: PlaygroundAccounts): Promise<{ vaultId: string; checks: AuditCheck[] }> {
  await purgePlaygroundData(accounts);

  const label = sampleLabel(kind);
  const vaultId = await createVault(
    accounts,
    kind === "complete" ? "Northwind booking — complete delivery" : "Northwind booking — uncomplete delivery",
    sampleDescription(kind)
  );
  await markVault(vaultId, kind);

  const files = await readSampleFiles(kind);
  for (const file of files) {
    await uploadService.processUpload({
      userId: accounts.freelancer.id,
      vaultId,
      file: {
        fieldname: "file",
        originalname: file.name,
        encoding: "7bit",
        mimetype: file.mimeType,
        size: file.buffer.length,
        buffer: file.buffer,
      } as Express.Multer.File,
    });
  }

  const manifest = await manifestService.generateVaultManifest(accounts.freelancer.id, vaultId);
  await writeManifest(vaultId, accounts.freelancer.id, manifest);

  const checks = await runVaultChecks(vaultId, {
    description: sampleDescription(kind),
    manifest: {
      sha: manifest.manifestHash,
      fileCount: manifest.totalFiles,
      totalSizeBytes: manifest.totalSizeBytes,
    },
  });
  await recordFailedChecks(vaultId, checks);

  await appendLedger(
    vaultId,
    "MANIFEST.LOCKED",
    accounts.freelancer.id,
    null,
    "USD",
    `Sample manifest locked: ${label}`,
    { manifestSha256: manifest.manifestHash, fileCount: manifest.totalFiles, sample: kind }
  );
  await appendLedger(
    vaultId,
    "AUDIT_COMPLETED",
    accounts.freelancer.id,
    null,
    "USD",
    `Sample checks ran: ${checks.filter((check) => check.result === "fail").length} failed`,
    { sample: kind, failedCheckIds: checks.filter((check) => check.result === "fail").map((check) => check.id) }
  );
  logger.info(`[playground] seeded ${kind} sample ${vaultId}`);
  return { vaultId, checks };
}

async function vaultOwnedByPlayground(vault: any, ids: Set<string>): Promise<boolean> {
  if (!ids.has(String(vault.freelancer_id))) return false;

  if (LIVE()) {
    const { data: members, error } = await supabase!
      .from("vault_members")
      .select("user_id")
      .eq("vault_id", vault.id);
    if (error) throw new DatabaseError(`Could not check playground members: ${error.message}`);
    return (members || []).length > 0 && (members || []).every((member: any) => ids.has(String(member.user_id)));
  }

  const members = [...database.store.members.values()].filter((member) => member.vault_id === vault.id);
  return members.length > 0 && members.every((member) => ids.has(member.user_id));
}

async function deleteVaultRows(vault: any, ids: Set<string>): Promise<void> {
  const vaultId = String(vault.id);

  if (vault.status !== "PAID") {
    const authorizationId =
      vault.paypal_authorization_id ||
      memory.captures.get(vaultId)?.captureId ||
      null;
    if (authorizationId && !String(authorizationId).startsWith("mock-")) {
      await paypalService.voidAuthorization(String(authorizationId), `playground-reset-${vaultId}`).catch((err) => {
        logger.warn(`[playground] could not void ${authorizationId} before reset: ${err?.message || "unknown"}`);
      });
    }
  }

  if (LIVE()) {
    const { data: files } = await supabase!.from("vault_files").select("storage_path").eq("vault_id", vaultId);
    for (const file of files || []) {
      if (file.storage_path) await storageAdapter.delete(String(file.storage_path));
    }

    /* every table that points at the vault must go before the vault itself */
    const deletions: Array<[string, string]> = [
      ["ledger_events", "vault_id"],
      ["vault_files", "vault_id"],
      ["vault_manifests", "vault_id"],
      ["vault_members", "vault_id"],
      ["vault_captures", "vault_id"],
      ["vault_payouts", "vault_id"],
      ["paypal_transactions", "vault_id"],
      ["vault_invites", "vault_id"],
    ];
    for (const [table, column] of deletions) {
      const { error } = await supabase!.from(table).delete().eq(column, vaultId);
      if (error && !/does not exist|schema cache/i.test(error.message)) {
        throw new DatabaseError(`Could not clear ${table} for the playground: ${error.message}`);
      }
    }
    const { error } = await supabase!.from("vaults").delete().eq("id", vaultId);
    if (error) throw new DatabaseError(`Could not clear the playground vault: ${error.message}`);
    return;
  }

  for (const [id, file] of database.store.files.entries()) {
    if (file.vault_id === vaultId) {
      await storageAdapter.delete(file.storage_path);
      database.store.files.delete(id);
    }
  }
  for (const [id, member] of database.store.members.entries()) {
    if (member.vault_id === vaultId) database.store.members.delete(id);
  }
  database.store.vaults.delete(vaultId);
  memory.captures.delete(vaultId);
  memory.payouts.delete(vaultId);
  manifestMemory.manifests.delete(vaultId);
  for (let i = memory.ledger.length - 1; i >= 0; i--) {
    if (memory.ledger[i].vault_id === vaultId) memory.ledger.splice(i, 1);
  }
  /* ids is deliberately read here: a future table keyed by actor only must not
     accidentally sweep another user's rows */
  void ids;
}

/** Delete exactly the vaults both reserved accounts own, and nothing else. */
export async function purgePlaygroundData(accounts: PlaygroundAccounts): Promise<number> {
  const ids = new Set([accounts.freelancer.id, accounts.client.id]);
  let deleted = 0;

  if (LIVE()) {
    const { data: vaults, error } = await supabase!
      .from("vaults")
      .select("id, status, freelancer_id, paypal_authorization_id")
      .eq("is_playground", true);
    if (error) throw new DatabaseError(`Could not list playground vaults: ${error.message}`);

    for (const vault of vaults || []) {
      if (!(await vaultOwnedByPlayground(vault, ids))) continue;
      await deleteVaultRows(vault, ids);
      deleted++;
    }
    return deleted;
  }

  const rows = [...database.store.vaults.values()].filter((vault) => vault.is_playground);
  for (const vault of rows) {
    if (!(await vaultOwnedByPlayground(vault, ids))) continue;
    await deleteVaultRows(vault, ids);
    deleted++;
  }
  return deleted;
}

async function baseline(accounts: PlaygroundAccounts): Promise<string> {
  const vaultId = await createVault(
    accounts,
    "Playground vault",
    "A fresh playground vault. Load a sample project to give it a delivery."
  );
  await markVault(vaultId, null);
  return vaultId;
}

export interface PlaygroundView {
  vaultId: string;
  status: string;
  title: string;
  amount: number;
  currency: string;
  sampleKind: SampleKind | null;
  failedChecks: Array<{ id: string; name: string; detail?: string }>;
  checks: Array<{ id: string; name: string; detail: string; result: string; rows?: Array<{ label: string; value: string }> }>;
}

async function view(vaultId: string): Promise<PlaygroundView> {
  let row: any;
  if (LIVE()) {
    const { data, error } = await supabase!
      .from("vaults")
      .select("id, status, title, description, amount, currency, playground_sample")
      .eq("id", vaultId)
      .maybeSingle();
    if (error || !data) throw new NotFoundError("Playground vault not found.", "PLAYGROUND_VAULT_NOT_FOUND");
    row = data;
  } else {
    row = database.store.vaults.get(vaultId);
    if (!row) throw new NotFoundError("Playground vault not found.", "PLAYGROUND_VAULT_NOT_FOUND");
  }
  const failed = await getFailedChecks(vaultId);
  const kind = row.playground_sample === "complete" || row.playground_sample === "incomplete" ? row.playground_sample : null;
  /* The seeded sample already has files and a locked manifest. Reading its
     checks here keeps a reload from showing an empty report; nothing is
     recorded, and the runner stays the one that decides every result. */
  const manifest = kind ? await getLockedManifest(vaultId) : null;
  const checks = kind
    ? await runVaultChecks(vaultId, {
        description: row.description ?? null,
        manifest: manifest
          ? { sha: manifest.sha, fileCount: manifest.fileCount, totalSizeBytes: manifest.totalSizeBytes }
          : null,
      })
    : [];
  return {
    vaultId,
    status: String(row.status),
    title: String(row.title),
    amount: Number(row.amount),
    currency: String(row.currency || "USD"),
    sampleKind: kind,
    failedChecks: failed,
    checks: checks.map((check) => ({
      id: check.id,
      name: check.name,
      detail: check.detail,
      result: check.result,
      rows: check.rows,
    })),
  };
}

function buyerCredentials(): { email: string; password: string; label: string } | null {
  const email = (process.env.SANDBOX_BUYER_EMAIL || process.env.PAYPAL_SANDBOX_BUYER_EMAIL || "").trim();
  const password = (process.env.SANDBOX_BUYER_PASSWORD || process.env.PAYPAL_SANDBOX_BUYER_PASSWORD || "").trim();
  if (!email || !password) return null;
  return { email, password, label: "Sandbox test buyer — not a real account" };
}

function accountView(account: PlaygroundAccount) {
  return { email: account.email, fullName: account.fullName, role: account.role };
}

async function tokensFor(accounts: PlaygroundAccounts, req: { ip?: string; headers: Record<string, any> }) {
  const ip = req.ip;
  const userAgent = req.headers["user-agent"];
  const [freelancer, client] = await Promise.all([
    authService.issueSessionFor({ ...accounts.freelancer, isPlayground: true }, ip, userAgent),
    authService.issueSessionFor({ ...accounts.client, isPlayground: true }, ip, userAgent),
  ]);
  return { freelancer: freelancer.token, client: client.token };
}

export async function startPlayground(req: { ip?: string; headers: Record<string, any> }) {
  const accounts = await ensurePlaygroundAccounts();
  let vault = await latestVault(accounts);
  if (!vault) {
    await seedSample("complete", accounts);
    vault = await latestVault(accounts);
    if (!vault) throw new DatabaseError("The playground vault could not be created.");
  }
  return {
    ...(await view(vault.id)),
    tokens: await tokensFor(accounts, req),
    accounts: { freelancer: accountView(accounts.freelancer), client: accountView(accounts.client) },
    buyer: buyerCredentials(),
  };
}

export async function loadSample(kind: SampleKind, req: { ip?: string; headers: Record<string, any> }) {
  const accounts = await ensurePlaygroundAccounts();
  const { vaultId, checks } = await seedSample(kind, accounts);
  return {
    ...(await view(vaultId)),
    checks: checks.map((check) => ({
      id: check.id,
      name: check.name,
      detail: check.detail,
      result: check.result,
      rows: check.rows,
    })),
    tokens: await tokensFor(accounts, req),
    accounts: { freelancer: accountView(accounts.freelancer), client: accountView(accounts.client) },
    buyer: buyerCredentials(),
  };
}

export async function resetPlayground(
  actorId: string,
  ip: string | undefined,
  req: { ip?: string; headers: Record<string, any> }
) {
  const accounts = await ensurePlaygroundAccounts();
  if (actorId !== accounts.freelancer.id && actorId !== accounts.client.id) {
    throw new ForbiddenError("Only a reserved playground account can reset the playground.", "PLAYGROUND_ONLY");
  }

  const deleted = await purgePlaygroundData(accounts);
  const vaultId = await baseline(accounts);
  await appendLedger(vaultId, "PLAYGROUND_RESET", actorId, null, "USD", "Playground data reset", {
    deletedVaults: deleted,
    ...(ip ? { ip } : {}),
  });

  return {
    ...(await view(vaultId)),
    deleted,
    tokens: await tokensFor(accounts, req),
    accounts: { freelancer: accountView(accounts.freelancer), client: accountView(accounts.client) },
    buyer: buyerCredentials(),
  };
}

export function samplesAreBundled(): boolean {
  return Boolean(path.resolve(process.cwd(), "playground-samples"));
}
