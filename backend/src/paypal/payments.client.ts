/**
 * payments.client.ts — capture lookup and payout creation.
 *
 * Separate from paypal.client.ts so the money-loop additions stay in one
 * small file. Every call carries a deterministic PayPal-Request-Id derived
 * from the operation, so a retry of the same operation is deduped by PayPal
 * instead of creating a second charge or a second payout.
 *
 * Base URL is pinned to sandbox unless PAYPAL_ENV says otherwise, and
 * PAYPAL_ENV is refused at boot elsewhere (shared/paypal.env.ts).
 */
import { AppError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

const SANDBOX = "https://api-m.sandbox.paypal.com";
const LIVE = "https://api-m.paypal.com";
const TIMEOUT_MS = 20_000;

let token: { value: string; expiresAt: number } | null = null;

export const paypalBaseUrl = (): string => (process.env.PAYPAL_ENV === "live" ? LIVE : SANDBOX);

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new AppError("PayPal credentials are not configured", 500, "PAYPAL_CONFIG_ERROR");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new AppError(`PayPal OAuth failed (${res.status})`, 502, "PAYPAL_AUTH_FAILED");
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function call<T>(endpoint: string, init: RequestInit, requestId: string): Promise<T> {
  const send = async (bearer: string) =>
    fetch(`${paypalBaseUrl()}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "PayPal-Request-Id": requestId,
        Prefer: "return=representation",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  let res = await send(await accessToken());
  if (res.status === 401) {
    token = null;
    res = await send(await accessToken());
  }
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const detail = body?.details?.[0]?.issue || body?.name || `HTTP ${res.status}`;
    logger.error(`[paypal] ${endpoint} failed: ${res.status} ${detail}`);
    throw new AppError(`PayPal request failed: ${detail}`, 502, "PAYPAL_API_ERROR");
  }
  return body as T;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  feeCents: number;
  netCents: number;
}

const toCents = (value: string | undefined): number => Math.round(Number(value || "0") * 100);

export async function getCapture(captureId: string): Promise<PayPalCapture> {
  const body = await call<any>(
    `/v2/payments/captures/${captureId}`,
    { method: "GET" },
    `get-capture-${captureId}`
  );
  const breakdown = body.seller_receivable_breakdown || {};
  const gross = toCents(body.amount?.value);
  return {
    id: body.id,
    status: body.status,
    amountCents: gross,
    currency: body.amount?.currency_code || "USD",
    feeCents: toCents(breakdown.paypal_fee?.value),
    netCents: toCents(breakdown.net_amount?.value) || gross,
  };
}

export async function captureAuthorization(params: {
  authorizationId: string;
  amountCents: number;
  currency: string;
}): Promise<PayPalCapture> {
  const body = await call<any>(
    `/v2/payments/authorizations/${params.authorizationId}/capture`,
    {
      method: "POST",
      body: JSON.stringify({
        final_capture: true,
        amount: { value: (params.amountCents / 100).toFixed(2), currency_code: params.currency },
        note_to_payer: "VaultLance deliverable approved and funds released.",
      }),
    },
    `capture-${params.authorizationId}`
  );
  const breakdown = body.seller_receivable_breakdown || {};
  const gross = toCents(body.amount?.value);
  return {
    id: body.id,
    status: body.status,
    amountCents: gross,
    currency: body.amount?.currency_code || params.currency,
    feeCents: toCents(breakdown.paypal_fee?.value),
    netCents: toCents(breakdown.net_amount?.value) || gross,
  };
}

export interface PayoutResult {
  batchId: string;
  itemId: string | null;
  status: string;
}

export async function createPayout(params: {
  senderBatchId: string;
  receiverEmail: string;
  amountCents: number;
  currency: string;
  note: string;
}): Promise<PayoutResult> {
  const body = await call<any>(
    "/v1/payments/payouts",
    {
      method: "POST",
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: params.senderBatchId,
          email_subject: "Your VaultLance payout",
          email_message: params.note,
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: { value: (params.amountCents / 100).toFixed(2), currency: params.currency },
            receiver: params.receiverEmail,
            sender_item_id: params.senderBatchId,
            note: params.note,
          },
        ],
      }),
    },
    `payout-${params.senderBatchId}`
  );
  const batch = body.batch_header || {};
  return {
    batchId: batch.payout_batch_id || params.senderBatchId,
    itemId: body.items?.[0]?.payout_item_id || null,
    status: batch.batch_status || "PENDING",
  };
}
