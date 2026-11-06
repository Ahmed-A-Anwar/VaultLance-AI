import { AppError } from "../shared/errors.js";
import { database } from "../shared/db.js";
import { isSupabaseConfigured, supabase } from "../shared/supabaseClient.js";

export const QUESTION_LIMIT = 15;
export const USER_RATE_LIMIT = 20;
export const USER_RATE_WINDOW_MS = 60_000;
export const MAX_QUESTION_CHARS = 1_000;

const memoryUsed = new Map<string, number>();
const userWindows = new Map<string, number[]>();

export function resetAuditUsageForTests(): void {
  memoryUsed.clear();
  userWindows.clear();
}

function checkRate(userId: string): void {
  const now = Date.now();
  const recent = (userWindows.get(userId) || []).filter((at) => now - at < USER_RATE_WINDOW_MS);
  if (recent.length >= USER_RATE_LIMIT) {
    throw new AppError("Too many audit questions. Try again in a minute.", 429, "RATE_LIMITED");
  }
  recent.push(now);
  userWindows.set(userId, recent);
}

export async function getQuestionsUsed(vaultId: string): Promise<number> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from("vaults")
      .select("questions_used")
      .eq("id", vaultId)
      .maybeSingle();
    if (!error && data && typeof (data as any).questions_used === "number") {
      const value = Number((data as any).questions_used);
      memoryUsed.set(vaultId, value);
      return value;
    }
  }
  const local = database.store.vaults.get(vaultId);
  return memoryUsed.get(vaultId) ?? Number((local as any)?.questions_used || 0);
}

export async function reserveQuestion(vaultId: string, userId: string): Promise<number> {
  checkRate(userId);

  if (isSupabaseConfigured() && supabase) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("vaults")
        .select("questions_used")
        .eq("id", vaultId)
        .maybeSingle();
      if (error) break;
      const current = Math.max(0, Number((data as any)?.questions_used || 0));
      if (current >= QUESTION_LIMIT) {
        throw new AppError("This vault has reached its 15-question limit.", 429, "QUESTION_LIMIT");
      }
      const next = current + 1;
      const { data: updated, error: updateError } = await supabase
        .from("vaults")
        .update({ questions_used: next })
        .eq("id", vaultId)
        .eq("questions_used", current)
        .select("questions_used")
        .maybeSingle();
      if (!updateError && updated) {
        memoryUsed.set(vaultId, next);
        return next;
      }
    }
  }

  const current = await getQuestionsUsed(vaultId);
  if (current >= QUESTION_LIMIT) {
    throw new AppError("This vault has reached its 15-question limit.", 429, "QUESTION_LIMIT");
  }
  const next = current + 1;
  memoryUsed.set(vaultId, next);
  const local = database.store.vaults.get(vaultId);
  if (local) (local as any).questions_used = next;
  return next;
}
