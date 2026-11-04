/**
 * webhook.routes.ts — POST /api/webhooks/paypal.
 *
 * Mounted with express.raw on this path only, before any JSON parser, so the
 * bytes PayPal signed are the bytes we verify. Invalid signature is a 400 with
 * no detail. A duplicate event id is claimed by a unique insert and answered
 * 200 doing nothing. The response leaves inside 3s: the event is stored, then
 * processing continues after the response.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { paypalService } from "./paypal.client.js";
import { claimEvent, markEventProcessed } from "./event.store.js";
import { processEvent, vaultIdFromEvent } from "./webhook.service.js";
import { logger } from "../shared/logger.js";

export type Verifier = (input: {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookEvent: unknown;
}) => Promise<boolean>;

export interface WebhookDeps {
  verify?: Verifier;
  process?: (event: any) => Promise<void>;
}

const header = (req: Request, name: string): string => String(req.headers[name] || "");

export function createWebhookRouter(deps: WebhookDeps = {}): Router {
  const router = Router();
  const verify: Verifier =
    deps.verify ||
    ((input) => {
      if (!process.env.PAYPAL_WEBHOOK_ID) {
        /* fail closed: an unconfigured webhook id must never accept anything */
        logger.error("[webhook] PAYPAL_WEBHOOK_ID is not set; refusing to verify");
        return Promise.resolve(false);
      }
      return paypalService.verifyWebhookSignature(input as any);
    });
  const handleEvent = deps.process || processEvent;

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "{}");
      let event: any;
      try {
        event = JSON.parse(raw.toString("utf8") || "{}");
      } catch {
        res.status(400).json({ success: false, message: "Invalid payload" });
        return;
      }

      if (!event?.id || !event?.event_type) {
        res.status(400).json({ success: false, message: "Invalid payload" });
        return;
      }

      const valid = await verify({
        authAlgo: header(req, "paypal-auth-algo"),
        certUrl: header(req, "paypal-cert-url"),
        transmissionId: header(req, "paypal-transmission-id"),
        transmissionSig: header(req, "paypal-transmission-sig"),
        transmissionTime: header(req, "paypal-transmission-time"),
        webhookEvent: event,
      });

      if (!valid) {
        logger.warn(`[webhook] rejected ${event.event_type} with an invalid signature`);
        res.status(400).json({ success: false });
        return;
      }

      const vaultId = vaultIdFromEvent(event);
      const { claimed } = await claimEvent({
        id: String(event.id),
        type: String(event.event_type),
        vaultId,
        payload: event,
      });

      if (!claimed) {
        res.status(200).json({ status: "ALREADY_PROCESSED" });
        return;
      }

      res.status(200).json({ status: "PROCESSED", eventId: event.id });

      /* heavy work after the response; the sweeper covers a crash here */
      void handleEvent(event)
        .then(() => markEventProcessed(String(event.id)))
        .catch((err) => logger.error(`[webhook] processing failed: ${err?.message || err}`));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
