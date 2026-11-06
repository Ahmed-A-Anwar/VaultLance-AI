/**
 * invite.routes.ts — additive invite-code routes.
 *
 * POST /api/vaults/:id/invite-code  freelancer: mint VL-XXXX-XXXX (7 days)
 * POST /api/vaults/:id/join         client: redeem it and join the vault
 * POST /api/vaults/join             client: same, resolving the vault from the code
 *
 * The existing POST /:id/invite (by email) is untouched, because the frontend
 * adapter depends on its shape. The code-only route exists because the client
 * holds the code, never the vault id.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../authorization/role.middleware.js";
import { sendSuccess, sendCreated } from "../shared/response.js";
import { BadRequestError, NotFoundError } from "../shared/errors.js";
import { assertFreelancerOwner } from "../money/access.js";
import { createInvite, redeemInvite, redeemInviteByCode, addClientMember } from "./invite.store.js";
import * as store from "../money/money.store.js";

const router = Router();
router.use(requireAuth);

const CODE_SHAPE = /^VL-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const codeFrom = (body: unknown): string =>
  String((body as { code?: unknown } | null)?.code ?? "").trim().toUpperCase();

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

/* POST /api/vaults/join { code } — the code resolves the vault. Wrong, spent
   and expired codes all answer the same 404, so the route is no oracle. */
router.post("/join", requireRole("CLIENT"), async (req, res, next) => {
  try {
    const code = codeFrom(req.body);
    if (!CODE_SHAPE.test(code)) {
      throw new BadRequestError("That invite code is not valid.", "INVITE_INVALID");
    }

    const redeemed = await redeemInviteByCode(code, req.user!.id);
    if (!redeemed) throw new NotFoundError("That invite code is not valid.", "INVITE_INVALID");

    await addClientMember(redeemed.vaultId, req.user!.id);
    await moveOnIfUnfunded(redeemed.vaultId);

    return sendSuccess(
      res,
      { vaultId: redeemed.vaultId, joined: true, status: (await store.getVaultMoney(redeemed.vaultId))?.status },
      "Joined the vault"
    );
  } catch (err) {
    next(err);
  }
});

router.post("/:id/join", requireRole("CLIENT"), async (req, res, next) => {
  try {
    const vaultId = String(req.params.id);
    const code = codeFrom(req.body);
    if (!CODE_SHAPE.test(code)) {
      throw new BadRequestError("That invite code is not valid.", "INVITE_INVALID");
    }

    const vault = await store.getVaultMoney(vaultId);
    /* same 404 for wrong, used and expired codes: no oracle */
    if (!vault) throw new NotFoundError("That invite code is not valid.", "INVITE_INVALID");

    const redeemed = await redeemInvite(code, vaultId, req.user!.id);
    if (!redeemed) throw new NotFoundError("That invite code is not valid.", "INVITE_INVALID");

    await addClientMember(vaultId, req.user!.id);
    await moveOnIfUnfunded(vaultId);

    return sendSuccess(res, { vaultId, joined: true, status: (await store.getVaultMoney(vaultId))?.status }, "Joined the vault");
  } catch (err) {
    next(err);
  }
});

export default router;
