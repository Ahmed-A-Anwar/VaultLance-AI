/**
 * payout.routes.ts — retrying a payout PayPal refused.
 *
 * Only the freelancer who owns the vault may ask, and only a row that actually
 * failed is retryable. The retry keeps the vault, takes a new sender_batch_id and
 * a bumped attempt (see ensurePayout), so the capture cannot be paid twice and a
 * `pending` or `paid` payout can never be re-sent.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { ConflictError, ForbiddenError } from "../shared/errors.js";
import { sendSuccess } from "../shared/response.js";
import { assertFreelancerOwner } from "./access.js";
import * as store from "./money.store.js";
import { ensurePayout } from "./payout.service.js";

const router = Router();
router.use(requireAuth);

router.post("/:id/payout/retry", async (req, res, next) => {
  try {
    if (!req.user) throw new ForbiddenError("Not authenticated.", "AUTH_REQUIRED");
    const vaultId = String(req.params.id);

    await assertFreelancerOwner(req.user.id, vaultId);

    const payout = await store.getPayout(vaultId);
    if (!payout) {
      throw new ConflictError("This vault has no payout to retry.", "PAYOUT_MISSING");
    }
    if (payout.status !== "failed") {
      throw new ConflictError(
        `Only a failed payout can be retried (it is ${payout.status}).`,
        "PAYOUT_NOT_FAILED"
      );
    }

    const status = await ensurePayout(vaultId, { retry: true });
    const after = await store.getPayout(vaultId);
    return sendSuccess(res, { status, payout: after }, `Payout retry: ${status}`);
  } catch (err) {
    next(err);
  }
});

export default router;
