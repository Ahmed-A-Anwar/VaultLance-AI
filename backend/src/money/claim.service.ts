/**
 * claim.service.ts — the one idempotent way a PayPal hold becomes AUTHORIZED.
 *
 * The browser return, the reconcile endpoint and the authorization webhook all
 * call this. Two of them can arrive at the same time, so the move is a
 * compare-and-set: exactly one caller wins and writes the ledger row, the other
 * sees AUTHORIZED with the same authorization id and returns claimed:false.
 *
 * Everything is checked against what the vault already stores — amount,
 * currency and the order id — so an authorization for another vault or another
 * amount is refused, never recorded.
 */
import { ConflictError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import * as store from "./money.store.js";

export interface ClaimAuthorizationInput {
  authorizationId: string;
  orderId?: string | null;
  amountCents: number;
  currency: string;
  via: "return" | "webhook";
  actorId?: string | null;
}

export interface ClaimResult {
  claimed: boolean;
  status: string;
}

/** States in which a hold is expected and may move the vault forward. */
const PENDING_STATES = ["AWAITING_AUTHORIZATION", "AWAITING_CLIENT", "DRAFT"];

export async function claimAuthorization(
  vaultId: string,
  input: ClaimAuthorizationInput
): Promise<ClaimResult> {
  const authorizationId = String(input.authorizationId || "").trim();
  if (!authorizationId) throw new ConflictError("No authorization id was supplied.", "AUTHORIZATION_MISSING");

  const vault = await store.getVaultMoney(vaultId);
  if (!vault) throw new ConflictError("Vault not found.", "VAULT_NOT_FOUND");

  if (vault.status === "AUTHORIZED" || vault.status === "PAID") {
    if (vault.authorizationId === authorizationId) {
      logger.info(`[claim] vault ${vaultId} already holds ${authorizationId} (${input.via}); no-op`);
      return { claimed: false, status: vault.status };
    }
    throw new ConflictError("This vault already holds a different authorization.", "AUTHORIZATION_MISMATCH");
  }

  if (!PENDING_STATES.includes(vault.status)) {
    throw new ConflictError(
      `Vault is ${vault.status}; a hold cannot move it forward.`,
      "INVALID_VAULT_STATUS"
    );
  }

  if (input.amountCents !== vault.amountCents || input.currency.toUpperCase() !== vault.currency.toUpperCase()) {
    throw new ConflictError(
      `Authorized ${input.amountCents} ${input.currency} does not match the vault amount ${vault.amountCents} ${vault.currency}.`,
      "AMOUNT_MISMATCH"
    );
  }

  if (vault.paypalOrderId && input.orderId && input.orderId !== vault.paypalOrderId) {
    throw new ConflictError("The authorization names another order.", "ORDER_MISMATCH");
  }

  /* Record the ids before the compare-and-set. A loser that re-reads between
     the winner's CAS and its id write would otherwise see AUTHORIZED with no
     authorization and report a false conflict. Writing the id is harmless even
     if this caller loses: PayPal did create that hold. */
  await store.rememberAuthorization(vaultId, authorizationId);
  if (input.orderId) await store.rememberOrder(vaultId, input.orderId);

  const moved = await store.casStatus(vaultId, vault.status, "AUTHORIZED");
  if (!moved) {
    const now = await store.getVaultMoney(vaultId);
    const nowAuth = now?.authorizationId || (await store.getAuthorizationId(vaultId));
    if (now && (now.status === "AUTHORIZED" || now.status === "PAID") && nowAuth === authorizationId) {
      logger.info(`[claim] vault ${vaultId} was claimed by another caller; no-op`);
      return { claimed: false, status: now.status };
    }
    throw new ConflictError(
      `Another change moved this vault (now ${now?.status ?? "unknown"}).`,
      "INVALID_VAULT_STATUS"
    );
  }

  await store.appendLedger(
    vaultId,
    "FUNDS_AUTHORIZED",
    input.actorId ?? null,
    vault.amountCents,
    vault.currency,
    input.via === "webhook"
      ? "Funds authorized at PayPal (webhook), held in escrow"
      : "Funds authorized and held in escrow",
    {
      authorizationId,
      ...(input.orderId ? { orderId: input.orderId } : {}),
      via: input.via,
    }
  );

  logger.info(`[claim] vault ${vaultId} AUTHORIZED via ${input.via} (${authorizationId})`);
  return { claimed: true, status: "AUTHORIZED" };
}
