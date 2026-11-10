/**
 * money.store.ts — the only place that touches money rows.
 *
 * Supabase REST is the system of record; the in-memory maps keep the unit
 * tests (USE_IN_MEMORY_DB=true) on the same code path. Every write that must
 * happen once is expressed as a compare-and-set or a unique insert, never as
 * read-then-write, so concurrent callers cannot both win.
 */
import crypto from "crypto";
import { database } from "../shared/db.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { toCents } from "./money.types.js";
import { AppError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import type { CaptureRecord, PayoutRecord, VaultMoney } from "./money.types.js";
import { invalidateVaultListCache } from "../vaults/vault-list.cache.js";

const memoryCaptures = new Map<string, CaptureRecord>();
const memoryPayouts = new Map<string, PayoutRecord>();
const memoryAuthorizations = new Map<string, string>();
const memoryAcceptedEvents = new Set<string>();
const memoryLedger: Array<{ vault_id: string; event_type: string; actor_id: string | null; metadata: any }> = [];

const live = () => isSupabaseConfigured() && supabase !== null;

/**
 * Write one PayPal id to the vault row and fail loudly if the row did not take
 * it. These writes used to ignore Supabase's error, so the caller carried on as
 * though the id were stored and the receipt read it from the ledger fallback —
 * or printed nothing at all.
 */
async function writeVaultColumn(vaultId: string, patch: Record<string, string>): Promise<void> {
  const { error } = await supabase!.from("vaults").update(patch).eq("id", vaultId);
  if (error) {
    const column = Object.keys(patch).join(",");
    logger.error(`[money] could not write ${column} for vault ${vaultId}: ${error.message}`);
    throw new AppError(`Could not save the PayPal id (${column}); try again.`, 500, "MONEY_WRITE_FAILED");
  }
  invalidateVaultListCache();
}

export const memory = {
  captures: memoryCaptures,
  payouts: memoryPayouts,
  events: memoryAcceptedEvents,
  ledger: memoryLedger,
  reset() {
    memoryCaptures.clear();
    memoryPayouts.clear();
    memoryAuthorizations.clear();
    memoryAcceptedEvents.clear();
    memoryLedger.length = 0;
  },
};

export async function getVaultMoney(vaultId: string): Promise<VaultMoney | null> {
  if (live()) {
    const { data } = await supabase!.from("vaults").select("*").eq("id", vaultId).maybeSingle();
    return data ? toVaultMoney(data) : null;
  }
  const row = database.store.vaults.get(vaultId);
  return row ? toVaultMoney(row) : null;
}

function toVaultMoney(row: any): VaultMoney {
  return {
    id: row.id,
    status: String(row.status),
    amountCents: toCents(row.amount_cents ?? row.amount ?? 0),
    currency: row.currency || "USD",
    freelancerId: row.freelancer_id,
    authorizationId: row.paypal_authorization_id || memoryAuthorizations.get(row.id) || null,
    paypalOrderId: row.paypal_order_id || null,
  };
}

/** Atomic: only the caller that sees `from` can move the vault to `to`. */
export async function casStatus(vaultId: string, from: string, to: string): Promise<boolean> {
  if (live()) {
    const { data, error } = await supabase!
      .from("vaults")
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq("id", vaultId)
      .eq("status", from)
      .select("id");
    const moved = !error && Array.isArray(data) && data.length === 1;
    if (moved) invalidateVaultListCache();
    return moved;
  }
  const row = database.store.vaults.get(vaultId);
  if (!row || String(row.status) !== from) return false;
  row.status = to as any;
  row.updated_at = new Date();
  invalidateVaultListCache();
  return true;
}

export async function setStatus(vaultId: string, to: string): Promise<void> {
  if (live()) {
    await supabase!.from("vaults").update({ status: to, updated_at: new Date().toISOString() }).eq("id", vaultId);
    invalidateVaultListCache();
    return;
  }
  const row = database.store.vaults.get(vaultId);
  if (row) {
    row.status = to as any;
    row.updated_at = new Date();
    invalidateVaultListCache();
  }
}

export async function rememberAuthorization(vaultId: string, authorizationId: string): Promise<void> {
  if (live()) {
    await writeVaultColumn(vaultId, { paypal_authorization_id: authorizationId });
    return;
  }
  /* the in-memory row is the equivalent of the column: tests and the demo path
     must see the id where the receipt reads it, not only in the lookup map */
  const row = database.store.vaults.get(vaultId);
  if (row) (row as any).paypal_authorization_id = authorizationId;
  memoryAuthorizations.set(vaultId, authorizationId);
  invalidateVaultListCache();
}

export async function rememberOrder(vaultId: string, orderId: string): Promise<void> {
  if (live()) {
    await writeVaultColumn(vaultId, { paypal_order_id: orderId });
    return;
  }
  const row = database.store.vaults.get(vaultId);
  if (row) (row as any).paypal_order_id = orderId;
  invalidateVaultListCache();
}

/* The receipt reads the capture id off the vault row, not off vault_captures:
   without this a paid vault shows an empty capture field even though PayPal
   captured the money. Written by the same routine that records the capture, so
   whoever confirms first fixes the row. */
export async function rememberCapture(vaultId: string, captureId: string): Promise<void> {
  if (live()) {
    await writeVaultColumn(vaultId, { paypal_capture_id: captureId });
    return;
  }
  const row = database.store.vaults.get(vaultId);
  if (row) (row as any).paypal_capture_id = captureId;
  invalidateVaultListCache();
}

export async function getAuthorizationId(vaultId: string): Promise<string | null> {
  const vault = await getVaultMoney(vaultId);
  if (vault?.authorizationId) return vault.authorizationId;
  if (!live()) return memoryAuthorizations.get(vaultId) || null;
  if (live()) {
    const { data } = await supabase!
      .from("ledger_events")
      .select("metadata")
      .eq("vault_id", vaultId)
      .eq("event_type", "FUNDS_AUTHORIZED")
      .order("created_at", { ascending: false })
      .limit(1);
    return (data?.[0]?.metadata as any)?.authorizationId || null;
  }
  return null;
}

export async function markFilesUnlocked(vaultId: string): Promise<void> {
  if (live()) {
    await supabase!.from("vault_files").update({ unlocked: true }).eq("vault_id", vaultId);
    invalidateVaultListCache();
    return;
  }
  /* the in-memory file rows carry no flag; PAID is the gate */
}

/** Insert-if-absent keyed by vault id. Returns the winning record. */
export async function saveCaptureOnce(record: CaptureRecord): Promise<{ created: boolean; record: CaptureRecord }> {
  if (live()) {
    const { error } = await supabase!.from("vault_captures").insert([
      {
        vault_id: record.vaultId,
        capture_id: record.captureId,
        status: record.status,
        gross_cents: record.grossCents,
        paypal_fee_cents: record.feeCents,
        net_cents: record.netCents,
        payout_cents: record.payoutCents,
        confirmed_via: record.confirmedVia,
        created_at: new Date().toISOString(),
      },
    ]);
    const existing = await getCapture(record.vaultId);
    invalidateVaultListCache();
    return { created: !error, record: existing || record };
  }
  const existing = memoryCaptures.get(record.vaultId);
  if (existing) return { created: false, record: existing };
  memoryCaptures.set(record.vaultId, record);
  invalidateVaultListCache();
  return { created: true, record };
}

export async function getCapture(vaultId: string): Promise<CaptureRecord | null> {
  if (live()) {
    const { data } = await supabase!.from("vault_captures").select("*").eq("vault_id", vaultId).maybeSingle();
    if (!data) return null;
    return {
      vaultId: data.vault_id,
      captureId: data.capture_id,
      status: data.status,
      grossCents: Number(data.gross_cents),
      feeCents: Number(data.paypal_fee_cents),
      netCents: Number(data.net_cents),
      payoutCents: Number(data.payout_cents),
      confirmedVia: data.confirmed_via,
      createdAt: data.created_at || undefined,
    };
  }
  return memoryCaptures.get(vaultId) || null;
}

/** Unique per vault: the second concurrent caller loses the insert. */
export async function createPayoutOnce(record: PayoutRecord): Promise<{ created: boolean; record: PayoutRecord }> {
  if (live()) {
    const { error } = await supabase!.from("vault_payouts").insert([
      {
        id: crypto.randomUUID(),
        vault_id: record.vaultId,
        status: record.status,
        amount_cents: record.amountCents,
        currency: record.currency,
        sender_batch_id: record.senderBatchId,
        attempt: record.attempt,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    const existing = await getPayout(record.vaultId);
    return { created: !error, record: existing || record };
  }
  const existing = memoryPayouts.get(record.vaultId);
  if (existing) return { created: false, record: existing };
  const now = new Date().toISOString();
  const stored = { ...record, createdAt: record.createdAt ?? now, updatedAt: record.updatedAt ?? now };
  memoryPayouts.set(record.vaultId, stored);
  return { created: true, record: stored };
}

export async function getPayout(vaultId: string): Promise<PayoutRecord | null> {
  if (live()) {
    const { data } = await supabase!.from("vault_payouts").select("*").eq("vault_id", vaultId).maybeSingle();
    if (!data) return null;
    return {
      vaultId: data.vault_id,
      status: data.status,
      amountCents: Number(data.amount_cents),
      currency: data.currency,
      senderBatchId: data.sender_batch_id,
      payoutItemId: data.payout_item_id || null,
      reason: data.reason || null,
      attempt: Number(data.attempt || 1),
      createdAt: data.created_at || undefined,
      updatedAt: data.updated_at || undefined,
    };
  }
  return memoryPayouts.get(vaultId) || null;
}

export async function updatePayout(vaultId: string, patch: Partial<PayoutRecord>): Promise<void> {
  if (live()) {
    const row: any = { updated_at: new Date().toISOString() };
    if (patch.status) row.status = patch.status;
    if (patch.payoutItemId !== undefined) row.payout_item_id = patch.payoutItemId;
    if (patch.reason !== undefined) row.reason = patch.reason;
    if (patch.senderBatchId) row.sender_batch_id = patch.senderBatchId;
    if (patch.attempt) row.attempt = patch.attempt;
    await supabase!.from("vault_payouts").update(row).eq("vault_id", vaultId);
    return;
  }
  const existing = memoryPayouts.get(vaultId);
  if (existing) {
    memoryPayouts.set(vaultId, {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function appendLedger(
  vaultId: string,
  eventType: string,
  actorId: string | null,
  amountCents: number | null,
  currency: string,
  note: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (live()) {
    /* a non-money event still needs a numeric amount: the column is not null,
       and a null here made the insert fail silently, losing waivers and
       revisions from the ledger. 0 says "no money moved" and keeps the row. */
    const { error } = await supabase!.from("ledger_events").insert([
      {
        id: crypto.randomUUID(),
        vault_id: vaultId,
        actor_id: actorId,
        event_type: eventType,
        amount: amountCents === null ? 0 : amountCents / 100,
        currency,
        metadata: { note, amountCents, ...extra },
        created_at: new Date().toISOString(),
      },
    ]);
    if (error) logger.error(`[money] ledger write failed for ${eventType}: ${error.message}`);
    invalidateVaultListCache();
    return;
  }
  memoryLedger.push({ vault_id: vaultId, event_type: eventType, actor_id: actorId, metadata: { note, amountCents, ...extra } });
  invalidateVaultListCache();
}

/** Payout rows for the vaults this freelancer owns, statuses only. */
export async function listPayoutsForFreelancer(
  userId: string
): Promise<Array<{ vaultId: string; status: string }>> {
  if (live()) {
    const { data: vaults } = await supabase!.from("vaults").select("id").eq("freelancer_id", userId);
    const ids = (vaults || []).map((row: any) => String(row.id));
    if (!ids.length) return [];
    const { data } = await supabase!.from("vault_payouts").select("vault_id, status").in("vault_id", ids);
    return (data || []).map((row: any) => ({ vaultId: String(row.vault_id), status: String(row.status) }));
  }
  const rows: Array<{ vaultId: string; status: string }> = [];
  for (const vault of database.store.vaults.values()) {
    if (vault.freelancer_id !== userId) continue;
    const payout = memoryPayouts.get(vault.id);
    if (payout) rows.push({ vaultId: vault.id, status: payout.status });
  }
  return rows;
}

/** An account-level ledger line. No vault owns it, so vault_id is null. */
export async function appendAccountLedger(
  userId: string,
  eventType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  if (live()) {
    const { error } = await supabase!.from("ledger_events").insert([
      {
        id: crypto.randomUUID(),
        vault_id: null,
        actor_id: userId,
        event_type: eventType,
        amount: null,
        currency: "USD",
        metadata,
        created_at: new Date().toISOString(),
      },
    ]);
    if (error) logger.warn(`[money] account ledger write failed: ${error.message}`);
    return;
  }
  memoryLedger.push({
    vault_id: null as unknown as string,
    event_type: eventType,
    actor_id: userId,
    metadata,
  });
}

/** Vaults stuck in CAPTURE_PENDING past the grace period, oldest first. */
export async function listCapturePending(olderThanSeconds: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000).toISOString();
  if (live()) {
    const { data } = await supabase!
      .from("vaults")
      .select("id, updated_at")
      .eq("status", "CAPTURE_PENDING")
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(25);
    return (data || []).map((r: any) => r.id);
  }
  const ids: string[] = [];
  for (const vault of database.store.vaults.values()) {
    if (String(vault.status) === "CAPTURE_PENDING" && vault.updated_at.getTime() < Date.now() - olderThanSeconds * 1000) {
      ids.push(vault.id);
    }
  }
  return ids;
}
