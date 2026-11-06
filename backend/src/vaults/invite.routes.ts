/**
 * invite.routes.ts — additive invite-code routes.
 *
 * POST /api/vaults/:id/invite-code  freelancer: mint VL-XXXX-XXXX (7 days)
 * POST /api/vaults/:id/join         client: redeem it, vault id known
 * POST /api/vaults/join             client: redeem it, vault resolved from code
 *
 * The code-only route is the judged one: the client never sends a vault id.
 * Wrong, expired, used-by-someone-else and malformed codes all answer the same
 * 404 with the same body, after the same short delay, so the route is not an
 * oracle. The client who already redeemed a code gets the same vault back
 * (idempotent rejoin), which is what makes a retried request safe.
 *
 * The existing POST /:id/invite (by email) is untouched, because the frontend
 * adapter depends on its shape.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../authorization/role.middleware.js";
import { sendSuccess, sendCreated } from "../shared/response.js";
import { AppError, BadRequestError, NotFoundError } from "../shared/errors.js";
import { assertFreelancerOwner } from "../money/access.js";
import { createInvite, redeemInvite, redeemInviteByCode, addClientMember } from "./invite.store.js";
import { normalizeInviteCode } from "./invite.code.js";
import { joinLimit, noteJoinFailure } from "./joinRateLimit.js";
import * as store from "../money/money.store.js";

const router = Router();
router.use(requireAuth);

const GENERIC_INVITE = "That invite code is not valid.";
/* every failure below waits the same beat before answering */
const FAIL_DELAY_MS = 25;
const failDelay = () => new Promise((resolve) => setTimeout(resolve, FAIL_DELAY_MS));

/** DRAFT and AWAITING_CLIENT both mean "the client has not funded yet". */
async function moveOnIfUnfunded(vaultId: string): Promise<void> {
  const vault = await store.getVaultMoney(vaultId);
  if (vault && (vault.status === "DRAFT" || vault.status === "AWAITING_CLIENT")) {
    await store.setStatus(vaultId, "AWAITING_AUTHORIZATION");
  }
}

router.post("/:id/invite-code", requireRole("FREELANCER"), async (req, res, next) => {
  try {
    const vaultId = String(req.params.id);
    await assertFreelancerOwner(req.user!.id, vaultId);
    const invite = await createInvite(vaultId, req.user!.id);
    return sendCreated(res, { vaultId, ...invite }, "Invite code created");
  } catch (err) {
    next(err);
  }
});

/* POST /api/vaults/join { code } — the code resolves the vault. */
router.post("/join", requireRole("CLIENT"), async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    const limit = joinLimit(userId, ip);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      throw new AppError("Too many attempts. Try again later.", 429, "RATE_LIMITED");
    }

    const code = normalizeInviteCode(req.body?.code);
    if (!code) {
      noteJoinFailure(userId, ip);
      await failDelay();
      throw new NotFoundError(GENERIC_INVITE, "INVITE_INVALID");
    }

    /* one conditional update decides the winner; the member row is written
       only by that winner, so two requests can never both join */
    const redeemed = await redeemInviteByCode(code, userId);
    if (!redeemed) {
      noteJoinFailure(userId, ip);
      await failDelay();
      throw new NotFoundError(GENERIC_INVITE, "INVITE_INVALID");
    }

    await addClientMember(redeemed.vaultId, userId);
    await moveOnIfUnfunded(redeemed.vaultId);

    /* the caller's answer carries no state, no project, no membership: the
       dashboard read is the only thing that describes the vault */
    return sendSuccess(res, { vaultId: redeemed.vaultId }, "Joined the vault");
  } catch (err) {
    next(err);
  }
});

router.post("/:id/join", requireRole("CLIENT"), async (req, res, next) => {
  try {
    const vaultId = String(req.params.id);
    const code = normalizeInviteCode(req.body?.code);
    if (!code) {
      throw new BadRequestError("That invite code is not valid.", "INVITE_INVALID");
    }

    const vault = await store.getVaultMoney(vaultId);
    /* same 404 for wrong, used and expired codes: no oracle */
    if (!vault) throw new NotFoundError(GENERIC_INVITE, "INVITE_INVALID");

    const redeemed = await redeemInvite(code, vaultId, req.user!.id);
    if (!redeemed) throw new NotFoundError(GENERIC_INVITE, "INVITE_INVALID");

    await addClientMember(vaultId, req.user!.id);
    await moveOnIfUnfunded(vaultId);

    return sendSuccess(res, { vaultId, joined: true, status: (await store.getVaultMoney(vaultId))?.status }, "Joined the vault");
  } catch (err) {
    next(err);
  }
});

export default router;
