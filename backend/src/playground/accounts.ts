/**
 * accounts.ts — the two reserved identities the playground runs as.
 *
 * They are real rows in `users` (with `is_playground = true`) and real
 * Supabase Auth users, so every request behind them is authenticated by the
 * same session store as a customer's. There is deliberately no password path
 * for a visitor: the playground route mints a session for a resolved account,
 * and reset refuses every token whose account lacks the flag.
 */
import crypto from "crypto";
import { database, type DbUserRecord } from "../shared/db.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { hashPassword } from "../auth/password.js";
import { DatabaseError } from "../shared/errors.js";
import type { UserRole } from "../shared/types.js";

export interface PlaygroundAccount {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

const FREELANCER_EMAIL = (process.env.PLAYGROUND_FREELANCER_EMAIL || "playground.freelancer@vaultlance.test")
  .trim()
  .toLowerCase();
const CLIENT_EMAIL = (process.env.PLAYGROUND_CLIENT_EMAIL || "playground.client@vaultlance.test")
  .trim()
  .toLowerCase();

const SPECS: Array<{ role: UserRole; email: string; fullName: string }> = [
  { role: "FREELANCER", email: FREELANCER_EMAIL, fullName: "playground freelancer" },
  { role: "CLIENT", email: CLIENT_EMAIL, fullName: "playground client" },
];

export const playgroundEmails = () => ({ freelancer: FREELANCER_EMAIL, client: CLIENT_EMAIL });

async function findAuthUserId(email: string): Promise<string | null> {
  if (!supabase) return null;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const found = data.users.find((user) => String(user.email || "").toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function ensureSupabaseAccount(spec: (typeof SPECS)[number]): Promise<PlaygroundAccount> {
  if (!supabase) throw new DatabaseError("Playground accounts need Supabase.");

  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .eq("email", spec.email)
    .maybeSingle();
  if (lookupError) throw new DatabaseError(`Could not look up ${spec.email}: ${lookupError.message}`);

  if (existing) {
    await supabase.from("users").update({ is_playground: true }).eq("id", existing.id);
    return {
      id: String(existing.id),
      email: String(existing.email),
      fullName: String(existing.full_name || spec.fullName),
      role: spec.role,
    };
  }

  let userId = await findAuthUserId(spec.email);
  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: spec.email,
      password: crypto.randomBytes(32).toString("base64url"),
      email_confirm: true,
      user_metadata: { full_name: spec.fullName, role: spec.role, playground: true },
    });
    if (error || !data.user) {
      /* a second start may race the first: the auth user can exist before its
         profile row does, so resolve it instead of failing the visitor */
      userId = await findAuthUserId(spec.email);
      if (!userId) throw new DatabaseError(`Could not create ${spec.email}: ${error?.message || "unknown"}`);
    } else {
      userId = data.user.id;
    }
  }

  const password_hash = await hashPassword(crypto.randomBytes(24).toString("hex"));
  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("users").insert([
    {
      id: userId,
      email: spec.email,
      password_hash,
      role: spec.role,
      full_name: spec.fullName,
      avatar_url: null,
      account_status: "ACTIVE",
      is_playground: true,
      created_at: now,
      updated_at: now,
    },
  ]);
  /* duplicate means another request won the insert; the row is what matters */
  if (insertError && !/duplicate/i.test(insertError.message)) {
    throw new DatabaseError(`Could not create the playground profile: ${insertError.message}`);
  }

  return { id: userId, email: spec.email, fullName: spec.fullName, role: spec.role };
}

export async function ensurePlaygroundAccounts(): Promise<{ freelancer: PlaygroundAccount; client: PlaygroundAccount }> {
  if (isSupabaseConfigured() && supabase) {
    const freelancer = await ensureSupabaseAccount(SPECS[0]);
    const client = await ensureSupabaseAccount(SPECS[1]);
    return { freelancer, client };
  }

  const byEmail = (email: string) => {
    for (const user of database.store.users.values()) {
      if (user.email.toLowerCase() === email) return user;
    }
    return null;
  };

  const ensureMemory = async (spec: (typeof SPECS)[number]): Promise<PlaygroundAccount> => {
    const found = byEmail(spec.email);
    if (found) {
      found.is_playground = true;
      return { id: found.id, email: found.email, fullName: found.full_name, role: spec.role };
    }
    const now = new Date();
    const record: DbUserRecord = {
      id: crypto.randomUUID(),
      email: spec.email,
      password_hash: await hashPassword(crypto.randomBytes(24).toString("hex")),
      full_name: spec.fullName,
      role: spec.role,
      avatar_url: null,
      account_status: "ACTIVE",
      is_playground: true,
      created_at: now,
      updated_at: now,
    };
    database.store.users.set(record.id, record);
    return { id: record.id, email: record.email, fullName: record.full_name, role: record.role };
  };

  return { freelancer: await ensureMemory(SPECS[0]), client: await ensureMemory(SPECS[1]) };
}
