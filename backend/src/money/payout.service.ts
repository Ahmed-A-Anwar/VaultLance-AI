/**
 * payout.service.ts — one payout per capture, retryable, never doubled.
 *
 * Guards: a row per vault (unique vault_id), statuses move
 * none -> creating -> pending -> paid | failed, and only a `failed` row can be
 * retried, with a new sender_batch_id suffix. A blocked row (net <= 0) is
 * terminal until a human looks at it.
 */
import { ConflictError, NotFoundError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import * as store from "./money.store.js";
import * as payments from "../paypal/payments.client.js";
import { senderBatchIdFor, type PayoutStatus } from "./money.types.js";
import { freelancerEmail } from "./access.js";

export async function ensurePayout(vaultId: string, opts: { retry?: boolean } = {}): Promise<PayoutStatus> {
  const vault = await store.getVaultMoney(vaultId);
  if (!vault) throw new NotFoundError("Vault not found.", "VAULT_NOT_FOUND");

  const capture = await store.getCapture(vaultId);
  if (!capture) throw new ConflictError("No verified capture for this vault yet.", "CAPTURE_REQUIRED");

  const existing = await store.getPayout(vaultId);
  if (existing) {
    if (["creating", "pending", "paid", "blocked"].includes(existing.status)) return existing.status;
    if (existing.status === "failed" && !opts.retry) return "failed";
  }

  if (capture.payoutCents <= 0) {
    await store.updatePayout(vaultId, { status: "blocked", reason: "net is not positive after the platform fee" });
    return "blocked";
  }

  const attempt = existing ? existing.attempt + 1 : 1;
  const senderBatchId = senderBatchIdFor(vaultId, attempt);

  if (existing) {
    await store.updatePayout(vaultId, { status: "creating", senderBatchId, attempt, reason: null });
  } else {
    const { created } = await store.createPayoutOnce({
      vaultId,
      status: "creating",
      amountCents: capture.payoutCents,
      currency: vault.currency,
      senderBatchId,
      payoutItemId: null,
      reason: null,
      attempt,
    });
    /* a concurrent caller created it first: it owns the PayPal call */
    if (!created) return "creating";
  }

  const email = await freelancerEmail(vault.freelancerId);
  if (!email) {
    await store.updatePayout(vaultId, { status: "failed", reason: "freelancer has no payout email" });
    return "failed";
  }

  try {
    const result = await payments.createPayout({
      senderBatchId,
      receiverEmail: email,
      amountCents: capture.payoutCents,
      currency: vault.currency,
      note: `VaultLance payout for vault ${vaultId}`,
    });
    await store.updatePayout(vaultId, { status: "pending", payoutItemId: result.itemId });
    await store.appendLedger(vaultId, "PAYOUT.CREATED", null, capture.payoutCents, vault.currency, "Payout created", {
      senderBatchId,
      batchId: result.batchId,
    });
    logger.info(`[money] payout ${senderBatchId} created for vault ${vaultId}`);
    return "pending";
  } catch (err: any) {
    const reason = String(err?.message || "payout call failed").slice(0, 200);
    await store.updatePayout(vaultId, { status: "failed", reason });
    await store.appendLedger(vaultId, "PAYOUT.FAILED", null, null, vault.currency, "Payout call failed", {
      senderBatchId,
    });
    logger.warn(`[money] payout failed for vault ${vaultId}: ${reason}`);
    return "failed";
  }
}
