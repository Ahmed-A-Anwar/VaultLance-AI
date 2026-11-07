/* paypalWrites.ts — the two PayPal calls the client's hold needs, behind
   FX.real.payments.

   Order first, then authorise the order the buyer approved. The SDK's button
   supplies the order id; nothing here decides an amount, and no client id or
   secret lives in this module. The server re-checks the authorised amount
   against the vault agreement before it records AUTHORIZED.

   The point of routing these through http.ts is the failure path: a timeout, a
   401 and an AMOUNT_MISMATCH now arrive as typed errors the button can show,
   instead of a bare fetch whose message was the only clue. */

import { request } from "./http";
import { realOn } from "../config/fx";

export interface PaypalOrder {
  orderId: string;
  /** set when PayPal already holds an approval for this vault and the server
      recorded it instead of minting a second order */
  claimed?: boolean;
  status?: string;
  authorizationId?: string;
}

export interface PaypalAuthorization {
  orderId: string;
  authorizationId: string;
  amount: number;
  currency: string;
}

/** POST /api/vaults/:id/payment/order */
export async function createPaypalOrder(vaultId: string): Promise<PaypalOrder> {
  if (!realOn("payments")) throw new Error("Real PayPal calls are switched off.");

  const raw = (await request<unknown>(`/vaults/${encodeURIComponent(vaultId)}/payment/order`, {
    method: "POST",
    body: {},
    timeoutMs: 60_000,
  })) as Record<string, unknown> | null;

  const orderId = typeof raw?.orderId === "string" ? raw.orderId : "";
  if (!orderId) throw new Error("PayPal did not return an order id.");

  return {
    orderId,
    ...(raw?.claimed === true ? { claimed: true } : {}),
    ...(typeof raw?.status === "string" ? { status: raw.status } : {}),
    ...(typeof raw?.authorizationId === "string" ? { authorizationId: raw.authorizationId } : {}),
  };
}

/** POST /api/vaults/:id/payment/reconcile — claim an approval PayPal already
    holds, using the order id the server stored. This is what makes a hold
    survive a return window that has no session. */
export async function reconcilePaypalOrder(vaultId: string): Promise<{ claimed: boolean; status?: string }> {
  if (!realOn("payments")) return { claimed: false };

  const raw = (await request<unknown>(`/vaults/${encodeURIComponent(vaultId)}/payment/reconcile`, {
    method: "POST",
    body: {},
    timeoutMs: 60_000,
  })) as Record<string, unknown> | null;

  return {
    claimed: Boolean(raw?.claimed),
    status: typeof raw?.status === "string" ? raw.status : undefined,
  };
}

/** POST /api/vaults/:id/payment/authorize */
export async function authorizePaypalOrder(vaultId: string, orderId: string): Promise<PaypalAuthorization> {
  if (!realOn("payments")) throw new Error("Real PayPal calls are switched off.");
  if (!orderId) throw new Error("PayPal did not return an order to authorize.");

  const raw = (await request<unknown>(`/vaults/${encodeURIComponent(vaultId)}/payment/authorize`, {
    method: "POST",
    body: { orderId },
    timeoutMs: 60_000,
  })) as Record<string, unknown> | null;

  const authorizationId = typeof raw?.authorizationId === "string" ? raw.authorizationId : "";
  if (!authorizationId) throw new Error("PayPal authorised the order but returned no authorization id.");

  return {
    orderId,
    authorizationId,
    amount: Number(raw?.amount) || 0,
    currency: String(raw?.currency ?? "USD"),
  };
}
