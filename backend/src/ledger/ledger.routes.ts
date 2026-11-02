import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { sendSuccess } from "../shared/response.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from("ledger_events")
        .select("*")
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
