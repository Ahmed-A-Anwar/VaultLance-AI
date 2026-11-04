/**
 * approve.service.ts — the client's approval is what captures the money.
 *
 * Previously POST /:id/approve wrote PAID without calling PayPal at all, so a
 * vault could read "paid" with nothing captured. Now approval is a
 * compare-and-set to CAPTURE_PENDING, a real capture, then the shared
 * confirmCapture routine (which also unlocks and pays out).
 */
import { ConflictError } from "../shared/errors.js";
import * as store from "./money.store.js";
import * as payments from "../paypal/payments.client.js";
import { assertClientMember } from "./access.js";
import { confirmCapture, type ConfirmResult } from "./capture.service.js";

export async function approveVault(vaultId: string, actorId: string): Promise<ConfirmResult> {
  await assertClientMember(actorId, vaultId);

  const vault = await store.getVaultMoney(vaultId);
  if (!vault) throw new ConflictError("Vault not found.", "VAULT_NOT_FOUND");

  if (vault.status === "PAID") {
    const recorded = await store.getCapture(vaultId);
    if (recorded) {
      const payout = await store.getPayout(vaultId);
      return {
        status: "PAID",
        captureId: recorded.captureId,
        payoutCents: recorded.payoutCents,
        payoutStatus: payout?.status ?? "none",
        alreadyConfirmed: true,
      };
    }
  }

  if (vault.status !== "AWAITING_APPROVAL") {
    throw new ConflictError(
      `Approving needs status AWAITING_APPROVAL (vault is ${vault.status}).`,
      "INVALID_VAULT_STATUS"
    );
  }

  const authorizationId = await store.getAuthorizationId(vaultId);
  if (!authorizationId) {
    throw new ConflictError(
      "No PayPal authorization is on file for this vault; the client must authorize payment first.",
      "AUTHORIZATION_MISSING"
    );
  }

  const moved = await store.casStatus(vaultId, "AWAITING_APPROVAL", "CAPTURE_PENDING");
  if (!moved) {
    const current = await store.getVaultMoney(vaultId);
    throw new ConflictError(
      `Another approval already moved this vault (now ${current?.status}).`,
      "INVALID_VAULT_STATUS"
    );
  }

  let captureId: string;
  try {
    const capture = await payments.captureAuthorization({
      authorizationId,
      amountCents: vault.amountCents,
      currency: vault.currency,
    });
    captureId = capture.id;
  } catch (err) {
    /* nothing moved: hand the vault back to the client to retry */
    await store.setStatus(vaultId, "AWAITING_APPROVAL");
    throw err;
  }

  return confirmCapture(vaultId, captureId, "approve");
}
