/**
 * paypal.client.ts — PayPal REST API v2 Service (M2 Implementation)
 *
 * Implements:
 * 1. OAuth2 token helper with caching & auto-refresh
 * 2. Create Order with intent: AUTHORIZE
 * 3. Authorize Order: POST /v2/checkout/orders/{id}/authorize
 * 4. Capture Authorization: POST /v2/payments/authorizations/{auth_id}/capture
 * 5. Void Authorization: POST /v2/payments/authorizations/{auth_id}/void
 * 6. Webhook Signature Verification: POST /v1/notifications/verify-webhook-signature
 */

import { logger } from "../shared/logger.js";
import { paypalBaseUrl } from "../shared/paypal.env.js";
import { frontendBaseUrl } from "../shared/frontend.url.js";
import { BadRequestError, AppError } from "../shared/errors.js";

interface PayPalTokenCache {
  accessToken: string;
  expiresAt: number; // Unix epoch ms
}

let tokenCache: PayPalTokenCache | null = null;

export class PayPalService {
  private get clientId(): string {
    return process.env.PAYPAL_CLIENT_ID || "";
  }

  private get clientSecret(): string {
    return process.env.PAYPAL_CLIENT_SECRET || "";
  }

  private get baseUrl(): string {
    return paypalBaseUrl();
  }

  /* No fallback: an unset webhook id must never turn verification into a pass.
     The route refuses to call us without it, and verifyWebhookSignature below
     fails closed if it is reached anyway. */
  public get webhookId(): string {
    return (process.env.PAYPAL_WEBHOOK_ID || "").trim();
  }

  /**
   * 1. Get OAuth2 Token from PayPal with caching & buffer renewal.
   */
  public async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Cache buffer: refresh 60 seconds before actual expiration
    if (tokenCache && tokenCache.expiresAt > now + 60_000) {
      return tokenCache.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new AppError("PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET missing in environment", 500, "PAYPAL_CONFIG_ERROR");
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error(`[PayPal] OAuth error: ${response.status} ${errBody}`);
      throw new AppError(`PayPal OAuth failed: ${errBody}`, 502, "PAYPAL_AUTH_FAILED");
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    return tokenCache.accessToken;
  }

  /**
   * Helper to perform authenticated PayPal API calls with auto-token refresh on 401.
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    let token = await this.getAccessToken();

    const makeCall = async (bearerToken: string) => {
      const headers = {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      };

      return fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });
    };

    let res = await makeCall(token);

    // If 401, refresh token once and retry
    if (res.status === 401) {
      logger.warn("[PayPal] Token 401 expired, refreshing...");
      tokenCache = null;
      token = await this.getAccessToken();
      res = await makeCall(token);
    }

    const responseBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      logger.error(`[PayPal] API Error ${endpoint}: ${res.status}`, responseBody);
      throw new BadRequestError(
        responseBody.message || responseBody.details?.[0]?.description || `PayPal API request failed (${res.status})`,
        "PAYPAL_API_ERROR"
      );
    }

    return responseBody as T;
  }

  /**
   * 2. Create Order with intent: AUTHORIZE
   */
  public async createAuthorizeOrder(params: {
    vaultId: string;
    amount: number;
    currency: string;
    description?: string;
    returnUrl?: string;
    cancelUrl?: string;
    origin?: string | null;
  }): Promise<{ orderId: string; status: string; links: any[] }> {
    const { vaultId, amount, currency, description, returnUrl, cancelUrl, origin } = params;
    /* the browser that started the flow must get it back, or the session is lost */
    const base = frontendBaseUrl(origin);
    const formattedAmount = Number(amount).toFixed(2);

    const payload = {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: vaultId,
          custom_id: vaultId,
          description: description || `VaultLance Escrow for Vault ${vaultId}`,
          amount: {
            currency_code: currency || "USD",
            value: formattedAmount,
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
            brand_name: "VaultLance AI",
            locale: "en-US",
            landing_page: "LOGIN",
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE",
            return_url: returnUrl || `${base}/vault/${vaultId}?status=authorized`,
            cancel_url: cancelUrl || `${base}/vault/${vaultId}?status=cancelled`,
          },
        },
      },
    };

    const res = await this.request<{ id: string; status: string; links: any[] }>("/v2/checkout/orders", {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `order-${vaultId}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    return {
      orderId: res.id,
      status: res.status,
      links: res.links,
    };
  }

  /**
   * 3. Authorize an Approved Order: POST /v2/checkout/orders/{order_id}/authorize
   */
  public async authorizeOrder(orderId: string): Promise<{
    orderId: string;
    authorizationId: string;
    status: string;
    amount: number;
    currency: string;
    raw: any;
  }> {
    const res = await this.request<any>(`/v2/checkout/orders/${orderId}/authorize`, {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `auth-${orderId}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({}),
    });

    // Extract authorization details from purchase_units[0].payments.authorizations[0]
    const purchaseUnit = res.purchase_units?.[0];
    const auth = purchaseUnit?.payments?.authorizations?.[0];

    if (!auth || !auth.id) {
      throw new BadRequestError("No authorization record returned from PayPal order authorization", "PAYPAL_NO_AUTH");
    }

    return {
      orderId: res.id,
      authorizationId: auth.id,
      status: auth.status,
      amount: parseFloat(auth.amount?.value || "0"),
      currency: auth.amount?.currency_code || "USD",
      raw: res,
    };
  }

  /**
   * 4. Capture an existing Authorization: POST /v2/payments/authorizations/{authorization_id}/capture
   */
  public async captureAuthorization(params: {
    authorizationId: string;
    amount?: number;
    currency?: string;
    note?: string;
  }): Promise<{
    captureId: string;
    status: string;
    amount: number;
    currency: string;
    raw: any;
  }> {
    const { authorizationId, amount, currency, note } = params;

    const payload: any = {
      final_capture: true,
      note_to_payer: note || "VaultLance deliverable approved & funds released.",
    };

    if (amount !== undefined && currency) {
      payload.amount = {
        value: Number(amount).toFixed(2),
        currency_code: currency,
      };
    }

    const res = await this.request<any>(`/v2/payments/authorizations/${authorizationId}/capture`, {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `capture-${authorizationId}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    return {
      captureId: res.id,
      status: res.status,
      amount: parseFloat(res.amount?.value || "0"),
      currency: res.amount?.currency_code || "USD",
      raw: res,
    };
  }

  /**
   * 5. Void an existing Authorization: POST /v2/payments/authorizations/{authorization_id}/void
   */
  /** Read an authorization's current state, used to confirm a void landed. */
  public async getAuthorization(authorizationId: string): Promise<{
    id: string;
    status: string;
    amount: number;
    currency: string;
  }> {
    const res = await this.request<any>(`/v2/payments/authorizations/${authorizationId}`, { method: "GET" });
    return {
      id: res.id,
      status: String(res.status || ""),
      amount: parseFloat(res.amount?.value || "0"),
      currency: res.amount?.currency_code || "USD",
    };
  }

  public async voidAuthorization(
    authorizationId: string,
    requestId: string = `void-${authorizationId}`
  ): Promise<{
    status: string;
    raw: any;
  }> {
    // PayPal void returns 204 No Content on success or representation if prefer set
    let res: any = {};
    try {
      res = await this.request<any>(`/v2/payments/authorizations/${authorizationId}/void`, {
        method: "POST",
        headers: {
          "PayPal-Request-Id": requestId,
          Prefer: "return=representation",
        },
        body: JSON.stringify({}),
      });
    } catch (err: any) {
      // If already voided, PayPal returns 422 with AUTHORIZATION_ALREADY_VOIDED
      if (err.message?.includes("AUTHORIZATION_ALREADY_VOIDED") || err.message?.includes("VOIDED")) {
        return { status: "VOIDED", raw: { status: "VOIDED" } };
      }
      throw err;
    }

    return {
      status: res?.status || "VOIDED",
      raw: res,
    };
  }

  /**
   * 6. Webhook Signature Verification
   */
  public async verifyWebhookSignature(params: {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
    webhookEvent: any;
  }): Promise<boolean> {
    const { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime, webhookEvent } = params;

    if (!this.webhookId) {
      logger.error("[PayPal] PAYPAL_WEBHOOK_ID is not set; refusing to verify");
      return false;
    }

    try {
      const payload = {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: this.webhookId,
        webhook_event: webhookEvent,
      };

      const res = await this.request<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      return res.verification_status === "SUCCESS";
    } catch (err) {
      logger.error("[PayPal] Webhook signature verification failed:", err);
      return false;
    }
  }
}

export const paypalService = new PayPalService();
