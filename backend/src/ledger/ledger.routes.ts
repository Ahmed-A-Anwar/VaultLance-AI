import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { sendSuccess } from "../shared/response.js";
import { database } from "../shared/db.js";

const router = Router();
router.use(requireAuth);

/* Which vaults may this caller read events for? Membership decides: the
   freelancer who owns the vault, and every accepted member row. This route used
   to answer with the table's last fifty rows — every user's money, including
   amounts and PayPal ids of strangers — and the frontend could only stay safe by
   not calling it at all. The filter belongs here. */
async function readableVaultIds(userId: string): Promise<string[]> {
  if (isSupabaseConfigured() && supabase) {
    const [{ data: owned }, { data: memberships }] = await Promise.all([
      supabase.from("vaults").select("id").eq("freelancer_id", userId),
      supabase.from("vault_members").select("vault_id").eq("user_id", userId),
    ]);
    return Array.from(
      new Set([
        ...(owned || []).map((row: any) => String(row.id)),
        ...(memberships || []).map((row: any) => String(row.vault_id)),
      ])
    );
  }

  const ids = new Set<string>();
  for (const vault of database.store.vaults.values()) {
    if (vault.freelancer_id === userId) ids.add(vault.id);
  }
  for (const member of database.store.members.values()) {
    if (member.user_id === userId) ids.add(member.vault_id);
  }
  return Array.from(ids);
}

router.get("/", async (req, res, next) => {
  try {
    const vaultIds = await readableVaultIds(req.user!.id);
    /* nothing of this caller's has moved money yet: an empty list, not a 403 */
    if (vaultIds.length === 0) return sendSuccess(res, [], "No ledger events");

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from("ledger_events")
        .select("*")
        .in("vault_id", vaultIds)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        return sendSuccess(res, [], "No ledger events");
      }
      return sendSuccess(res, data || [], "Ledger events retrieved");
    }

    return sendSuccess(res, [], "Ledger events retrieved");
  } catch (err) {
    next(err);
  }
});

export default router;
