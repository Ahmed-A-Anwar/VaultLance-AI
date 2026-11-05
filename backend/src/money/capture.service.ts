/**
 * capture.service.ts — the single idempotent confirmCapture routine.
 *
 * Called by the webhook, by the fallback, by the approve endpoint and by the
 * sweeper. Whoever gets there first wins the CAPTURE_PENDING -> PAID
 * compare-and-set and writes the ledger rows; everyone else sees PAID and
 * returns the existing capture. The PayPal capture is always re-fetched and
 * checked for COMPLETED and for the stored amount — the webhook body alone is
 * never trusted.
 */
import { ConflictError, NotFoundError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import * as store from "./money.store.js";
import * as payments from "../paypal/payments.client.js";
import { freelancerPayoutCents } from "./money.types.js";
import { ensurePayout } from "./payout.service.js";
import type { PayoutStatus } from "./money.types.js";

export interface ConfirmResult {
  status: "PAID";
  captureId: string;
  payoutCents: number;
  payoutStatus: PayoutStatus;
  alreadyConfirmed: boolean;
}

export async function confirmCapture(
  vaultId: string,
  captureId: string,
  via: "webhook" | "fallback" | "approve" | "sweeper"
): Promise<ConfirmResult> {
  const vault = await store.getVaultMoney(vaultId);
  if (!vault) throw new NotFoundError("Vault not found.", "VAULT_NOT_FOUND");

  const recorded = await store.getCapture(vaultId);

  if (vault.status === "PAID") {
    if (recorded && recorded.captureId === captureId) {
      const payout = await store.getPayout(vaultId);
      return {
        status: "PAID",
        captureId,
        payoutCents: recorded.payoutCents,
        payoutStatus: payout?.status ?? "none",
        alreadyConfirmed: true,
      };
    }
    throw new ConflictError("This vault is already paid by a different capture.", "ALREADY_PAID");
  }

  if (vault.status !== "CAPTURE_PENDING") {
    throw new ConflictError(
      `Capture needs status CAPTURE_PENDING (vault is ${vault.status}).`,
      "INVALID_VAULT_STATUS"
    );
  }

  if (recorded && recorded.captureId !== captureId) {
    throw new ConflictError("A different capture is already recorded for this vault.", "CAPTURE_MISMATCH");
  }

  const capture = await payments.getCapture(captureId);
  if (capture.status !== "COMPLETED") {
    throw new ConflictError(`Capture ${captureId} is ${capture.status}, not COMPLETED.`, "CAPTURE_NOT_COMPLETED");
  }
  if (capture.amountCents !== vault.amountCents) {
    throw new ConflictError(
      `Captured amount (${capture.amountCents} cents) does not match the agreed amount (${vault.amountCents} cents).`,
      "AMOUNT_MISMATCH"
    );
  }

  const grossCents = capture.amountCents;
  const feeCents = capture.feeCents;
  const netCents = capture.netCents || grossCents - feeCents;
  const payoutCents = Math.max(freelancerPayoutCents(grossCents, netCents), 0);

  const { created } = await store.saveCaptureOnce({
    vaultId,
    captureId,
    status: capture.status,
    grossCents,
    feeCents,
    netCents,
    payoutCents,
    confirmedVia: via,
  });

  const moved = await store.casStatus(vaultId, "CAPTURE_PENDING", "PAID");

  /* the receipt and the room's PAID panel read this off the vault row; without
     it a genuinely captured vault renders an empty capture id */
  await store.rememberCapture(vaultId, captureId);

  if (created || moved) {
    await store.markFilesUnlocked(vaultId);
    await store.appendLedger(vaultId, "PAYMENT.CAPTURED", null, grossCents, vault.currency, "Capture verified with PayPal", {
      captureId,
      grossCents,
      feeCents,
      netCents,
      payoutCents,
      via,
    });
    await store.appendLedger(vaultId, "FILES.UNLOCKED", null, null, vault.currency, "Deliverables unlocked after capture", {
      captureId,
    });
    logger.info(`[money] vault ${vaultId} confirmed via ${via} (capture ${captureId})`);
  }

  const payoutStatus: PayoutStatus = payoutCents > 0 ? await ensurePayout(vaultId) : "blocked";

  return { status: "PAID", captureId, payoutCents, payoutStatus, alreadyConfirmed: !moved && !created };
}
