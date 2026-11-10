/**
 * waivers.ts — the failed report and the waivers taken against it.
 *
 * The server, not the browser, decides which checks failed: a check run writes
 * its failures here, and approval may only waive ids that appear in that stored
 * report. Supabase is the system of record when configured; the vault row in
 * the in-memory store is the fallback for tests.
 */
import { database } from "../shared/db.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { logger } from "../shared/logger.js";
import { invalidateVaultListCache } from "../vaults/vault-list.cache.js";

export interface FailedCheck {
  id: string;
  name: string;
  detail: string;
}

export interface WaiverRecord {
  checkId: string;
  name: string;
  reason?: string;
  waivedAt: string;
  waivedBy: string;
}

const live = () => isSupabaseConfigured() && supabase !== null;

function memoryState(vaultId: string) {
  const vault = database.store.vaults.get(vaultId);
  return {
    failed: Array.isArray((vault as any)?.failed_checks) ? ((vault as any).failed_checks as FailedCheck[]) : [],
    waived: Array.isArray((vault as any)?.waived_checks) ? ((vault as any).waived_checks as WaiverRecord[]) : [],
    note: (((vault as any)?.revision_note ?? null) as string | null),
  };
}

async function readState(vaultId: string) {
  if (live()) {
    const { data, error } = await supabase!
      .from("vaults")
      .select("failed_checks, waived_checks, revision_note")
      .eq("id", vaultId)
      .maybeSingle();

    if (error) {
      logger.warn(`[audit] could not read the failed report for ${vaultId}: ${error.message}`);
      return memoryState(vaultId);
    }

    if (data) {
      return {
        failed: Array.isArray(data.failed_checks) ? (data.failed_checks as FailedCheck[]) : [],
        waived: Array.isArray(data.waived_checks) ? (data.waived_checks as WaiverRecord[]) : [],
        note: (data.revision_note ?? null) as string | null,
      };
    }
  }
  return memoryState(vaultId);
}

async function writeState(
  vaultId: string,
  patch: Record<string, unknown>
): Promise<void> {
  if (live()) {
    const { error } = await supabase!.from("vaults").update(patch).eq("id", vaultId);
    if (error) {
      /* A lost report must not lose the audit answer: the check run still
         returns, but approval will not be able to waive an id it cannot read. */
      logger.error(`[audit] could not save the audit state for ${vaultId}: ${error.message}`);
    }
    invalidateVaultListCache();
    return;
  }

  const vault = database.store.vaults.get(vaultId);
  if (!vault) return;
  for (const [key, value] of Object.entries(patch)) {
    (vault as any)[key] = value;
  }
  invalidateVaultListCache();
}

export async function getFailedChecks(vaultId: string): Promise<FailedCheck[]> {
  return (await readState(vaultId)).failed;
}

export async function getWaivedChecks(vaultId: string): Promise<WaiverRecord[]> {
  return (await readState(vaultId)).waived;
}

export async function getRevisionNote(vaultId: string): Promise<string | null> {
  return (await readState(vaultId)).note;
}

/** Replaces the stored report and clears waivers from the previous delivery. */
export async function recordFailedChecks(
  vaultId: string,
  checks: Array<{ id: string; name: string; detail?: string; result: string }>
): Promise<void> {
  const failed: FailedCheck[] = checks
    .filter((check) => check.result === "fail")
    .map((check) => ({ id: check.id, name: check.name, detail: check.detail ?? "" }));

  await writeState(vaultId, { failed_checks: failed, waived_checks: [] });
}

/** Append waivers, one entry per check id, keeping the first for a repeat id. */
export async function recordWaivers(vaultId: string, records: WaiverRecord[]): Promise<void> {
  if (!records.length) return;
  const current = await getWaivedChecks(vaultId);
  const byId = new Map(current.map((row) => [row.checkId, row]));
  for (const record of records) {
    if (!byId.has(record.checkId)) byId.set(record.checkId, record);
  }
  await writeState(vaultId, { waived_checks: [...byId.values()] });
}

export async function setRevisionNote(vaultId: string, note: string | null): Promise<void> {
  await writeState(vaultId, { revision_note: note });
}
