import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizePaypalOrder, createPaypalOrder } from "./paypalWrites";
import { ConflictError, configureHttp, setAccessToken } from "./http";
import { realOverride } from "../config/fx";

const ID = "b2831415-9f89-430f-8581-b2c8ec757074";
const reply = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
  });
  configureHttp("http://api.test/api");
  setAccessToken("tok-123");
  realOverride.payments = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setAccessToken(null);
  delete realOverride.payments;
});

describe("paypalWrites", () => {
  it("creates the order on the vault's payment route", async () => {
    const fetchMock = vi.fn(async () => reply(201, { success: true, data: { orderId: "ORDER-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPaypalOrder(ID)).resolves.toEqual({ orderId: "ORDER-1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/vaults/${ID}/payment/order`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-123" });
  });

  it("keeps PayPal's payer checkout link for the direct fallback", async () => {
    const href = "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(201, {
          success: true,
          data: { orderId: "ORDER-1", links: [{ rel: "payer-action", href }] },
        })
      )
    );

    await expect(createPaypalOrder(ID)).resolves.toEqual({ orderId: "ORDER-1", approvalUrl: href });
  });

  it("refuses an order answer with no id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(201, { success: true, data: {} })));
    await expect(createPaypalOrder(ID)).rejects.toThrow(/order id/);
  });

  it("authorizes with the buyer's order id and reports the held amount", async () => {
    const fetchMock = vi.fn(async () =>
      reply(200, { success: true, data: { authorizationId: "AUTH-9", amount: 180, currency: "USD" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(authorizePaypalOrder(ID, "ORDER-1")).resolves.toEqual({
      orderId: "ORDER-1",
      authorizationId: "AUTH-9",
      amount: 180,
      currency: "USD",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/vaults/${ID}/payment/authorize`);
    expect(JSON.parse(String(init.body))).toEqual({ orderId: "ORDER-1" });
  });

  it("surfaces an amount mismatch as the server's conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(409, { success: false, message: "Authorized amount ($180) does not match agreed vault amount ($200).", error: { code: "AMOUNT_MISMATCH" } })
      )
    );
    await expect(authorizePaypalOrder(ID, "ORDER-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("does nothing with the flag off", async () => {
    realOverride.payments = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createPaypalOrder(ID)).rejects.toThrow(/switched off/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
