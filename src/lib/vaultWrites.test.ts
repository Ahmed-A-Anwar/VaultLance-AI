import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, configureHttp, setAccessToken } from "./http";
import { createVaultOnServer, isServerVaultId, submitVaultOnServer } from "./vaultWrites";
import { realOverride } from "../config/fx";

const ID = "b2831415-9f89-430f-8581-b2c8ec757074";

const reply = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  /* http.ts times out with window.setTimeout, which a node test env lacks */
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
  });
  configureHttp("http://api.test/api");
  setAccessToken("tok-123");
  realOverride.vaultsWrite = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setAccessToken(null);
  delete realOverride.vaultsWrite;
});

describe("vaultWrites", () => {
  it("recognises a server id and leaves a mock id alone", () => {
    expect(isServerVaultId(ID)).toBe(true);
    expect(isServerVaultId("v_abc123")).toBe(false);
  });

  it("creates with the amount in dollars and the bearer token on the wire", async () => {
    const fetchMock = vi.fn(async () => reply(201, { success: true, data: { id: ID, title: "Site", amount: 18.5, status: "DRAFT" } }));
    vi.stubGlobal("fetch", fetchMock);

    const created = await createVaultOnServer({ title: " Site ", description: " brief ", amountCents: 1850 });

    expect(created).toEqual({ id: ID });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/api/vaults");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-123" });
    expect(JSON.parse(String(init.body))).toEqual({ title: "Site", description: "brief", amount: 18.5, currency: "USD" });
  });

  it("refuses an unreadable creation answer instead of handing back an id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(201, { success: true, data: { title: "no id" } })));
    await expect(createVaultOnServer({ title: "Site", amountCents: 100 })).rejects.toThrow(/could not be read/);
  });

  it("submits by id and returns the locked hash", async () => {
    const fetchMock = vi.fn(async () => reply(200, { success: true, data: { manifestSha256: "abc123", fileCount: 2 } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitVaultOnServer(ID)).resolves.toEqual({ manifestSha256: "abc123", fileCount: 2 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/vaults/${ID}/submit`);
    expect(init.method).toBe("POST");
  });

  it("surfaces the server's 409 as a conflict, not a silent success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(409, { success: false, message: "Submitting needs status IN_PROGRESS or AUTHORIZED (vault is DRAFT).", error: { code: "INVALID_VAULT_STATUS" } }))
    );
    await expect(submitVaultOnServer(ID)).rejects.toBeInstanceOf(ConflictError);
    await expect(submitVaultOnServer(ID)).rejects.toMatchObject({ code: "INVALID_VAULT_STATUS", status: 409 });
  });

  it("does nothing at all with the flag off", async () => {
    realOverride.vaultsWrite = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createVaultOnServer({ title: "Site", amountCents: 100 })).rejects.toThrow(/switched off/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
