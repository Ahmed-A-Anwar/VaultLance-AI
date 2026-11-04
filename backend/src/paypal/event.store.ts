/**
 * event.store.ts — verified webhook events, claimed exactly once.
 *
 * The unique key is the PayPal event id, so a replayed delivery loses the
 * insert and is answered 200 without side effects. The in-memory set keeps
 * unit tests on the same path.
 */
import crypto from "crypto";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { memory } from "../money/money.store.js";

export interface ClaimResult {
  claimed: boolean;
}

export async function claimEvent(event: {
  id: string;
  type: string;
  vaultId: string | null;
  payload: unknown;
}): Promise<ClaimResult> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from("paypal_events").insert([
      {
        id: crypto.randomUUID(),
        paypal_event_id: event.id,
        event_type: event.type,
        vault_id: event.vaultId,
        processing_status: "RECEIVED",
        payload: event.payload,
        received_at: new Date().toISOString(),
      },
    ]);
    /* 23505 = duplicate key: the event was already claimed */
    if (!error) return { claimed: true };
    return { claimed: false };
  }

  if (memory.events.has(event.id)) return { claimed: false };
  memory.events.add(event.id);
  return { claimed: true };
}

export async function markEventProcessed(eventId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  await supabase
    .from("paypal_events")
    .update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() })
    .eq("paypal_event_id", eventId);
}
