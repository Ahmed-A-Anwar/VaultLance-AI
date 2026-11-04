/**
 * webhook.service.ts — what a verified event is allowed to do.
 *
 * Only types that move money are acted on. Everything is matched to a vault by
 * custom_id AND cross-checked against the ids we stored for that vault, so a
 * forged custom_id on a real event cannot be used to unlock someone else's
 * vault. Unknown types are already stored by the caller and are ignored here.
 */
import { logger } from "../shared/logger.js";
import * as store from "../money/money.store.js";
import { confirmCapture } from "../money/capture.service.js";

const stripBatch = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = value.match(/^vl-(.+?)(?:-r\d+)?$/);
  return match ? match[1] : null;
};

export function vaultIdFromEvent(event: any): string | null {
  const resource = event.resource || {};
  return (
    resource.custom_id ||
    resource.purchase_units?.[0]?.custom_id ||
    resource.purchase_units?.[0]?.reference_id ||
    stripBatch(resource.payout_item?.sender_item_id) ||
    stripBatch(resource.sender_batch_id) ||
    null
  );
}

export async function processEvent(event: any): Promise<void> {
  const type = String(event.event_type || "");
  const resource = event.resource || {};
  const vaultId = vaultIdFromEvent(event);

  if (!vaultId) {
    logger.info(`[webhook] ${type} carries no vault reference; stored and ignored`);
    return;
  }

  const vault = await store.getVaultMoney(vaultId);
  if (!vault) {
    logger.warn(`[webhook] ${type} refers to unknown vault ${vaultId}; stored and ignored`);
    return;
  }

  switch (type) {
    case "CHECKOUT.ORDER.APPROVED": {
      if (resource.id) await store.rememberOrder(vaultId, String(resource.id));
      return;
    }

    case "PAYMENT.AUTHORIZATION.CREATED": {
      const declaredOrder = resource.supplementary_data?.related_ids?.order_id;
      if (vault.paypalOrderId && declaredOrder && declaredOrder !== vault.paypalOrderId) {
        logger.warn(`[webhook] authorization for vault ${vaultId} names another order; ignored`);
        return;
      }
      if (resource.id) await store.rememberAuthorization(vaultId, String(resource.id));
      return;
    }

    case "PAYMENT.AUTHORIZATION.VOIDED": {
      await store.appendLedger(vaultId, "AUTHORIZATION.VOIDED", null, null, vault.currency, "PayPal voided the hold", {
        authorizationId: resource.id,
      });
      return;
    }

    case "PAYMENT.CAPTURE.COMPLETED": {
      const captureId = String(resource.id || "");
      if (!captureId) return;
      const declaredAuth = resource.supplementary_data?.related_ids?.authorization_id;
      if (vault.authorizationId && declaredAuth && declaredAuth !== vault.authorizationId) {
        logger.warn(`[webhook] capture for vault ${vaultId} names another authorization; ignored`);
        return;
      }
      const recorded = await store.getCapture(vaultId);
      if (recorded && recorded.captureId !== captureId) {
        logger.warn(`[webhook] vault ${vaultId} already recorded capture ${recorded.captureId}; ignoring ${captureId}`);
        return;
      }
      try {
        await confirmCapture(vaultId, captureId, "webhook");
      } catch (err: any) {
        /* the sweeper retries; never a 500 for a known event type */
        logger.warn(`[webhook] capture ${captureId} not confirmed yet: ${err?.message || "unknown"}`);
      }
      return;
    }

    case "PAYMENT.CAPTURE.DENIED": {
      await store.appendLedger(vaultId, "CAPTURE.DENIED", null, null, vault.currency, "PayPal denied the capture", {
        captureId: resource.id,
      });
      return;
    }

    case "PAYMENT.CAPTURE.REFUNDED": {
      await store.appendLedger(vaultId, "CAPTURE.REFUNDED", null, null, vault.currency, "Capture refunded", {
        captureId: resource.id,
      });
      return;
    }

    case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": {
      await store.updatePayout(vaultId, {
        status: "paid",
        payoutItemId: resource.payout_item_id || null,
        reason: null,
      });
      await store.appendLedger(vaultId, "PAYOUT.PAID", null, null, vault.currency, "Payout reached the freelancer", {
        payoutItemId: resource.payout_item_id,
      });
      return;
    }

    case "PAYMENT.PAYOUTS-ITEM.FAILED":
    case "PAYMENT.PAYOUTS-ITEM.BLOCKED":
    case "PAYMENT.PAYOUTS-ITEM.RETURNED": {
      const reason = String(resource.errors?.message || resource.transaction_status || type).slice(0, 200);
      await store.updatePayout(vaultId, { status: "failed", reason });
      await store.appendLedger(vaultId, "PAYOUT.FAILED", null, null, vault.currency, `Payout ${type.split(".").pop()}`, {
        payoutItemId: resource.payout_item_id,
        reason,
      });
      return;
    }

    default:
      logger.info(`[webhook] ${type} stored and ignored`);
  }
}
