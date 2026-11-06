/**
 * payoutProfile.service.ts — the address a freelancer is paid at, and the
 * audit line that records a change without recording the address.
 *
 * The profile is optional: an empty value falls back to the login email when a
 * payout is sent. A payout already moving freezes the field, because changing
 * where the money goes mid-flight is how a payout and its receipt disagree.
 */
import { BadRequestError, ConflictError } from "../shared/errors.js";
import { database } from "../shared/db.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import * as store from "../money/money.store.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed, lowercased, one field, at most 254 characters. */
export function normalizePayoutEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new BadRequestError("Enter a valid PayPal email.", "VALIDATION_ERROR");
  }
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    throw new BadRequestError("Enter a valid PayPal email.", "VALIDATION_ERROR");
  }
  return email;
}

/** m***@example.com — enough to recognize, not enough to reuse. */
export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at < 1) return "***";
  return `${value.slice(0, 1)}***@${value.slice(at + 1)}`;
}

export async function readPayoutEmail(userId: string): Promise<string | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from("users")
      .select("paypal_payout_email")
      .eq("id", userId)
      .maybeSingle();
    const stored = typeof data?.paypal_payout_email === "string" ? data.paypal_payout_email.trim() : "";
    return stored || null;
  }
  const stored = database.store.users.get(userId)?.paypal_payout_email?.trim();
  return stored || null;
}

export async function savePayoutEmail(userId: string, raw: unknown): Promise<string> {
  const email = normalizePayoutEmail(raw);

  const moving = await store.listPayoutsForFreelancer(userId);
  if (moving.some((row) => ["creating", "pending"].includes(String(row.status).toLowerCase()))) {
    throw new ConflictError(
      "A payout is still in progress. You can change the payout email once it settles.",
      "PAYOUT_IN_PROGRESS"
    );
  }

  const previous = await readPayoutEmail(userId);

  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from("users")
      .update({ paypal_payout_email: email, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw new BadRequestError("The payout email could not be saved.", "PAYOUT_EMAIL_WRITE_FAILED");
  } else {
    const user = database.store.users.get(userId);
    if (!user) throw new BadRequestError("Account not found.", "USER_NOT_FOUND");
    user.paypal_payout_email = email;
    user.updated_at = new Date();
  }

  /* masked only: the ledger says a change happened, never what the address is */
  await store.appendAccountLedger(userId, "PAYOUT.EMAIL_CHANGED", {
    field: "paypal_payout_email",
    previous: previous ? maskEmail(previous) : null,
    next: maskEmail(email),
  });

  return email;
}
