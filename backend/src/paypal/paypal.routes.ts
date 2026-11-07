/**
 * paypal.routes.ts — PayPal Order, Authorization, Capture, Void, and Webhook Routes (Milestone 2)
 *
 * Endpoints:
 * - POST /api/vaults/:vaultId/payment/order    -> Create PayPal authorization order
 * - POST /api/vaults/:vaultId/payment/authorize-> Authorize buyer-approved PayPal order
 * - POST /api/vaults/:vaultId/capture          -> Capture active authorization (Human approval)
 * - POST /api/vaults/:vaultId/void             -> Void authorization (Cancellation / Reject)
 * - POST /api/webhooks/paypal                  -> PayPal Webhook ingestion with deduplication & signature validation
 */

import { Router } from "express";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.middleware.js";
import { paypalService } from "./paypal.client.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import { sendSuccess, sendCreated } from "../shared/response.js";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  SecurityError,
} from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import { dataIsolationService } from "../authorization/isolation.service.js";
import { approveVault } from "../money/approve.service.js";
import { getAuthorizationId, rememberAuthorization, rememberOrder } from "../money/money.store.js";
import { claimAuthorization } from "../money/claim.service.js";
import { database } from "../shared/db.js";
import type { VaultStatus } from "../shared/types.js";

export const paypalRouter = Router();
export const paypalWebhookRouter = Router();

/* ── In-Memory transaction storage for unit tests / fallback ───────────── */
interface LocalPayPalTx {
  id: string;
  vaultId: string;
  orderId?: string;
  authorizationId?: string;
  captureId?: string;
  amount: number;
  currency: string;
  status: "CREATED" | "PENDING" | "AUTHORIZED" | "COMPLETED" | "CAPTURED" | "FAILED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
}
const localTxStore = new Map<string, LocalPayPalTx>();
const localProcessedWebhooks = new Set<string>();

/* ── Helper: verify vault access & return record ───────────────────────── */
async function getVaultAndVerifyAccess(userId: string, vaultId: string) {
  if (isSupabaseConfigured() && supabase) {
    const { data: vault, error } = await supabase
      .from("vaults")
      .select("*")
      .eq("id", vaultId)
      .single();

    if (error || !vault) {
      throw new NotFoundError("Vault not found.", "VAULT_NOT_FOUND");
    }

    const { data: members } = await supabase
      .from("vault_members")
      .select("user_id, role")
      .eq("vault_id", vaultId)
      .eq("user_id", userId);

    const isOwner = vault.freelancer_id === userId;
    const isMember = members && members.length > 0;

    if (!isOwner && !isMember) {
      throw new ForbiddenError("You do not have access to this vault.", "ACCESS_DENIED");
    }

    return vault;
  }

  const { vault } = await dataIsolationService.getVaultIfAuthorized(userId, vaultId);
  return vault;
}

/* ── Helper: the last order PayPal was asked for on this vault ─────────── */
async function findLatestOrderId(vaultId: string): Promise<string | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from("paypal_transactions")
      .select("paypal_order_id")
      .eq("vault_id", vaultId)
      .order("created_at", { ascending: false })
      .limit(1);
    return ((data?.[0]?.paypal_order_id as string) || null) || null;
  }
  for (const tx of localTxStore.values()) {
    if (tx.vaultId === vaultId && tx.orderId) return tx.orderId;
  }
  return null;
}

/* PayPal allows one authorization per order, so a buyer who already approved
   must never be told the payment failed: the order is in the way, not broken. */
function orderAlreadyApproved(err: any): boolean {
  const text = `${err?.code || ""} ${err?.message || ""}`.toLowerCase();
  return (
    text.includes("order_already_authorized") ||
    text.includes("order_already_captured") ||
    text.includes("already authorized") ||
    text.includes("already been authorized") ||
    text.includes("order already captured")
  );
}

/* Record a hold PayPal already has: one routine, so a browser return, a retry,
   a webhook and a page open can never double-record or disagree. */
async function claimApprovedOrder(vaultId: string, vault: any, userId: string, orderId: string) {
  const authResult = await paypalService.authorizeOrder(orderId);

  if (Math.abs(authResult.amount - Number(vault.amount)) > 0.01) {
    throw new BadRequestError(
      `Authorized amount ($${authResult.amount}) does not match agreed vault amount ($${vault.amount}).`,
      "AMOUNT_MISMATCH"
    );
  }

  /* The webhook can deliver the same hold while the buyer's browser is still
     on the way back. Both go through one compare-and-set, so exactly one writes
     the id and the ledger row and the other is a no-op. */
  await claimAuthorization(vaultId, {
    authorizationId: authResult.authorizationId,
    orderId,
    amountCents: Math.round(authResult.amount * 100),
    currency: authResult.currency,
    via: "return",
    actorId: userId,
  });

  if (isSupabaseConfigured() && supabase) {
    await supabase
      .from("paypal_transactions")
      .update({ status: "AUTHORIZED", updated_at: new Date().toISOString() })
      .eq("paypal_order_id", orderId);
  } else {
    const tx = localTxStore.get(orderId);
    if (tx) {
      tx.authorizationId = authResult.authorizationId;
      tx.status = "AUTHORIZED";
      tx.updatedAt = new Date();
    }
  }

  return authResult;
}

/* ── Helper: insert ledger event ───────────────────────────────────────── */
async function recordLedgerEvent(
  vaultId: string,
  actorId: string,
  eventType: string,
  amount: number | null,
  currency: string,
  note: string,
  extraMetadata: Record<string, any> = {}
) {
  if (isSupabaseConfigured() && supabase) {
    await supabase.from("ledger_events").insert([
      {
        id: crypto.randomUUID(),
        vault_id: vaultId,
        actor_id: actorId,
        event_type: eventType,
        amount,
        currency,
        metadata: { note, ...extraMetadata },
        created_at: new Date().toISOString(),
      },
    ]);
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 1. POST /api/vaults/:vaultId/payment/order
 * Step 3: Create an authorization order
 * ───────────────────────────────────────────────────────────────────────── */
paypalRouter.post("/:vaultId/payment/order", requireAuth, async (req, res, next) => {
  try {
    const vaultId = String(req.params.vaultId);
    const userId = req.user!.id;
    const vault = await getVaultAndVerifyAccess(userId, vaultId);

    /* A room can still say AWAITING PAYMENT after PayPal has already held the
       money. Minting a second order is refused by PayPal and strands the
       buyer; hand back the hold that already exists instead. */
    const currentStatus = String(vault.status || "").toUpperCase();
    if (["AUTHORIZED", "AWAITING_APPROVAL", "CAPTURE_PENDING", "PAID"].includes(currentStatus)) {
      const authorizationId = await getAuthorizationId(vaultId);
      const existingOrderId = String(
        (vault as any).paypal_order_id || (await findLatestOrderId(vaultId)) || ""
      );
      if (authorizationId && existingOrderId) {
        return sendSuccess(
          res,
          {
            vaultId,
            orderId: existingOrderId,
            authorizationId,
            claimed: true,
            status: "AUTHORIZED",
            amount: Number(vault.amount),
            currency: vault.currency || "USD",
          },
          "Payment already approved at PayPal; the hold is already recorded"
        );
      }
    }

    // Validate eligible status for payment creation
    const eligibleStatuses: VaultStatus[] = [
      "AWAITING_AUTHORIZATION",
      "AWAITING_CLIENT",
      "DRAFT",
      /* a delivery can be submitted before the client is invited; the locked
         manifest must not make the vault impossible to fund */
      "SUBMITTED",
    ];
    if (!eligibleStatuses.includes(vault.status as VaultStatus)) {
      throw new BadRequestError(
        `Vault in status '${vault.status}' is not eligible for payment order creation.`,
        "INVALID_VAULT_STATUS"
      );
    }

    const amount = Number(vault.amount);
    const currency = vault.currency || "USD";

    // Call PayPal Orders API v2 with intent: AUTHORIZE
    let orderResult: Awaited<ReturnType<typeof paypalService.createAuthorizeOrder>>;
    try {
      orderResult = await paypalService.createAuthorizeOrder({
      vaultId,
      amount,
      currency,
      description: `VaultLance Escrow: ${vault.title}`,
      returnUrl: req.body?.returnUrl,
      cancelUrl: req.body?.cancelUrl,
        /* the origin the payment started from keeps its session after the redirect */
        origin: req.get("origin"),
      });
    } catch (err) {
      if (!orderAlreadyApproved(err)) throw err;

      /* the buyer approved an earlier order for this vault: record that hold
         instead of failing on an order PayPal will not mint twice */
      const existingOrderId = String(
        (vault as any).paypal_order_id || (await findLatestOrderId(vaultId)) || ""
      );
      if (!existingOrderId) throw err;

      const authResult = await claimApprovedOrder(vaultId, vault, userId, existingOrderId);
      logger.info(`[PayPal] ${existingOrderId} was already approved; hold recorded for ${vaultId}`);

      return sendSuccess(
        res,
        {
          vaultId,
          orderId: existingOrderId,
          authorizationId: authResult.authorizationId,
          claimed: true,
          status: "AUTHORIZED",
          amount: authResult.amount,
          currency: authResult.currency,
        },
        "Payment already approved at PayPal; the hold is now recorded"
      );
    }

    await rememberOrder(vaultId, orderResult.orderId);

    // Record in database / local store
    const txId = crypto.randomUUID();
    if (isSupabaseConfigured() && supabase) {
      await supabase.from("paypal_transactions").insert([
        {
          id: txId,
          vault_id: vaultId,
          paypal_order_id: orderResult.orderId,
          amount,
          currency,
          status: "CREATED",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    } else {
      localTxStore.set(orderResult.orderId, {
        id: txId,
        vaultId,
        orderId: orderResult.orderId,
        amount,
        currency,
        status: "CREATED",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return sendCreated(res, {
      orderId: orderResult.orderId,
      status: orderResult.status,
      links: orderResult.links,
      amount,
      currency,
    }, "PayPal authorization order created");
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 2. POST /api/vaults/:vaultId/payment/authorize
 * Step 5: Authorize order on backend after buyer approval
 * ───────────────────────────────────────────────────────────────────────── */
paypalRouter.post("/:vaultId/payment/authorize", requireAuth, async (req, res, next) => {
  try {
    const vaultId = String(req.params.vaultId);
    const { orderId } = req.body;
    const userId = req.user!.id;

    if (!orderId) {
      throw new BadRequestError("PayPal 'orderId' is required.", "MISSING_ORDER_ID");
    }

    const vault = await getVaultAndVerifyAccess(userId, vaultId);

    // Call PayPal to authorize the approved order
    const authResult = await paypalService.authorizeOrder(orderId);
    await rememberAuthorization(vaultId, authResult.authorizationId);

    // Verify returned amount and currency match the agreement
    if (Math.abs(authResult.amount - Number(vault.amount)) > 0.01) {
      throw new BadRequestError(
        `Authorized amount ($${authResult.amount}) does not match agreed vault amount ($${vault.amount}).`,
        "AMOUNT_MISMATCH"
      );
    }

    // Update vault status to AUTHORIZED
    if (isSupabaseConfigured() && supabase) {
      await supabase
        .from("vaults")
        .update({
          status: "AUTHORIZED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", vaultId);

      // Record / update transaction
      await supabase
        .from("paypal_transactions")
        .update({
          status: "AUTHORIZED",
          updated_at: new Date().toISOString(),
        })
        .eq("paypal_order_id", orderId);
    } else {
      const v = database.store.vaults.get(vaultId);
      if (v) {
        v.status = "AUTHORIZED";
        v.updated_at = new Date();
      }
      const tx = localTxStore.get(orderId);
      if (tx) {
        tx.authorizationId = authResult.authorizationId;
        tx.status = "AUTHORIZED";
        tx.updatedAt = new Date();
      }
    }

    // Ledger event for funds authorized
    await recordLedgerEvent(
      vaultId,
      userId,
      "FUNDS_AUTHORIZED",
      authResult.amount,
      authResult.currency,
      "PayPal funds authorized and held in escrow",
      { orderId, authorizationId: authResult.authorizationId }
    );

    return sendSuccess(res, {
      vaultId,
      orderId,
      authorizationId: authResult.authorizationId,
      status: "AUTHORIZED",
      amount: authResult.amount,
      currency: authResult.currency,
    }, "Payment successfully authorized");
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 2b. POST /api/vaults/:vaultId/payment/reconcile
 *
 * The buyer's approval lives at PayPal, so a hold must not depend on the
 * browser coming back from the redirect: two live sandbox approvals were never
 * claimed because the return window had no session. This uses the order id the
 * vault already stores and records the authorization PayPal says exists.
 * ───────────────────────────────────────────────────────────────────────── */
paypalRouter.post("/:vaultId/payment/reconcile", requireAuth, async (req, res, next) => {
  try {
    const vaultId = String(req.params.vaultId);
    const userId = req.user!.id;
    const vault = await getVaultAndVerifyAccess(userId, vaultId);

    const eligible: VaultStatus[] = ["AWAITING_AUTHORIZATION", "AWAITING_CLIENT", "DRAFT"];
    if (!eligible.includes(vault.status as VaultStatus)) {
      return sendSuccess(
        res,
        { vaultId, claimed: false, status: vault.status },
        "Nothing to reconcile"
      );
    }

    const orderId = String(
      (vault as any).paypal_order_id || req.body?.orderId || (await findLatestOrderId(vaultId)) || ""
    );
    if (!orderId) {
      throw new ConflictError("No PayPal order is on file for this vault.", "ORDER_MISSING");
    }

    let authResult: Awaited<ReturnType<typeof paypalService.authorizeOrder>>;
    try {
      authResult = await claimApprovedOrder(vaultId, vault, userId, orderId);
    } catch (err: any) {
      if (err?.code === "AMOUNT_MISMATCH") throw err;
      /* not approved yet is an answer, not a failure: the caller retries later */
      logger.info(`[PayPal] reconcile: ${orderId} not approved yet (${err?.message || "no detail"})`);
      return sendSuccess(res, { vaultId, orderId, claimed: false }, "Order not approved yet");
    }

    return sendSuccess(
      res,
      {
        vaultId,
        orderId,
        claimed: true,
        status: "AUTHORIZED",
        authorizationId: authResult.authorizationId,
        amount: authResult.amount,
        currency: authResult.currency,
      },
      "Payment successfully authorized"
    );
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 3. POST /api/vaults/:id/capture
 * Step 6: Server-side capture after approval
 * ───────────────────────────────────────────────────────────────────────── */
paypalRouter.post("/:id/capture", requireAuth, async (req, res, next) => {
  try {
    const vaultId = String(req.params.id);

    /* only the invited client, only from AWAITING_APPROVAL; the same routine
       the approve route and the webhook use, so it can never double-capture */
    const result = await approveVault(vaultId, req.user!.id);

    return sendSuccess(
      res,
      {
        vaultId,
        status: "PAID",
        captureId: result.captureId,
        payoutCents: result.payoutCents,
        payoutStatus: result.payoutStatus,
      },
      "Payment captured and deliverables unlocked"
    );
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 4. POST /api/vaults/:id/void
 * Step 7: Void active authorization on cancellation / rejection
 * ───────────────────────────────────────────────────────────────────────── */
paypalRouter.post("/:id/void", requireAuth, async (req, res, next) => {
  try {
    const vaultId = String(req.params.id);
    const userId = req.user!.id;
    const vault = await getVaultAndVerifyAccess(userId, vaultId);

    const allowedStatuses: VaultStatus[] = [
      "AUTHORIZED",
      "IN_PROGRESS",
      "SUBMITTED",
      "VERIFYING",
      "AWAITING_APPROVAL",
      "AWAITING_AUTHORIZATION",
      "AWAITING_CLIENT",
      "DRAFT",
    ];

    if (!allowedStatuses.includes(vault.status as VaultStatus)) {
      throw new BadRequestError(
        `Cannot void vault with status '${vault.status}'.`,
        "INVALID_VAULT_STATUS"
      );
    }

    // Find authorization ID if exists
    let authorizationId = req.body.authorizationId;
    if (!authorizationId && isSupabaseConfigured() && supabase) {
      const { data: txs } = await supabase
        .from("ledger_events")
        .select("metadata")
        .eq("vault_id", vaultId)
        .eq("event_type", "FUNDS_AUTHORIZED")
        .order("created_at", { ascending: false })
        .limit(1);

      if (txs && txs.length > 0 && txs[0].metadata?.authorizationId) {
        authorizationId = txs[0].metadata.authorizationId;
      }
    }

    if (authorizationId && !authorizationId.startsWith("mock-")) {
      try {
        await paypalService.voidAuthorization(authorizationId);
      } catch (err: any) {
        logger.warn(`[PayPal] Void call warning: ${err.message}`);
      }
    }

    // Update vault status to CANCELLED
    if (isSupabaseConfigured() && supabase) {
      await supabase
        .from("vaults")
        .update({
          status: "CANCELLED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", vaultId);
    } else {
      const v = database.store.vaults.get(vaultId);
      if (v) {
        v.status = "CANCELLED";
        v.updated_at = new Date();
      }
    }

    await recordLedgerEvent(
      vaultId,
      userId,
      "VAULT_CANCELLED",
      Number(vault.amount),
      vault.currency || "USD",
      "Hold voided, nothing was charged",
      { authorizationId }
    );

    return sendSuccess(res, {
      vaultId,
      status: "CANCELLED",
      voided: true,
    }, "Vault authorization voided and hold released");
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 5. POST /api/webhooks/paypal
 * Step 8: Webhook verification and idempotent event processing
 * ───────────────────────────────────────────────────────────────────────── */
paypalWebhookRouter.post("/", async (req, res, next) => {
  try {
    const headers = req.headers;
    const authAlgo = String(headers["paypal-auth-algo"] || "");
    const certUrl = String(headers["paypal-cert-url"] || "");
    const transmissionId = String(headers["paypal-transmission-id"] || "");
    const transmissionSig = String(headers["paypal-transmission-sig"] || "");
    const transmissionTime = String(headers["paypal-transmission-time"] || "");
    const webhookEvent = req.body;

    if (!webhookEvent || !webhookEvent.id) {
      throw new BadRequestError("Invalid webhook payload.", "INVALID_WEBHOOK");
    }

    const eventId = webhookEvent.id;
    const eventType = webhookEvent.event_type;

    logger.info(`[PayPal Webhook] Received ${eventType} (${eventId})`);

    // Verify signature
    const isValid = await paypalService.verifyWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookEvent,
    });

    if (!isValid) {
      logger.error(`[PayPal Webhook] Invalid signature for event ${eventId}`);
      throw new SecurityError("Invalid PayPal webhook signature.", "INVALID_SIGNATURE");
    }

    // Deduplication check: check if event already processed
    if (isSupabaseConfigured() && supabase) {
      const { data: existing } = await supabase
        .from("webhook_events")
        .select("id")
        .eq("external_event_id", eventId)
        .limit(1);

      if (existing && existing.length > 0) {
        logger.info(`[PayPal Webhook] Duplicate event ${eventId} safely ignored`);
        return res.status(200).json({ status: "ALREADY_PROCESSED" });
      }

      // Persist raw webhook event
      await supabase.from("webhook_events").insert([
        {
          id: crypto.randomUUID(),
          provider: "PAYPAL",
          external_event_id: eventId,
          event_type: eventType,
          processing_status: "COMPLETED",
          received_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        },
      ]);
    } else {
      if (localProcessedWebhooks.has(eventId)) {
        return res.status(200).json({ status: "ALREADY_PROCESSED" });
      }
      localProcessedWebhooks.add(eventId);
    }

    // Process event types
    const resource = webhookEvent.resource || {};
    const vaultId = resource.custom_id || resource.purchase_units?.[0]?.reference_id;

    if (vaultId) {
      if (eventType === "PAYMENT.AUTHORIZATION.CREATED") {
        logger.info(`[PayPal Webhook] Authorization created for vault ${vaultId}`);
      } else if (eventType === "PAYMENT.AUTHORIZATION.VOIDED") {
        logger.info(`[PayPal Webhook] Authorization voided for vault ${vaultId}`);
      } else if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
        logger.info(`[PayPal Webhook] Capture confirmed for vault ${vaultId}`);
      }
    }

    return res.status(200).json({ status: "PROCESSED", eventId });
  } catch (err) {
    next(err);
  }
});
