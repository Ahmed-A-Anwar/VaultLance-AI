import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildManifest, uploadArchive, verifyManifest } from "./uploadWrites";
import { configureHttp, setAccessToken } from "./http";
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
  realOverride.uploads = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setAccessToken(null);
  delete realOverride.uploads;
});

describe("uploadWrites", () => {
  it("posts the archive as multipart, without a JSON content type", async () => {
    const fetchMock = vi.fn(async () => reply(201, { success: true, data: { id: "f1", fileName: "site.zip" } }));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["zipbytes"], "site.zip", { type: "application/zip" });
    await expect(uploadArchive(ID, file)).resolves.toEqual({ id: "f1", name: "site.zip" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/uploads/${ID}`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty("Content-Type");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("reads the manifest hash and file count", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { success: true, data: { manifestHash: "abc", totalFiles: 3 } })));
    await expect(buildManifest(ID)).resolves.toEqual({ hash: "abc", totalFiles: 3 });
  });

  it("treats an answer without a hash as empty, not as a fingerprint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { success: true, data: { totalFiles: 0 } })));
    await expect(buildManifest(ID)).resolves.toEqual({ hash: "", totalFiles: 0 });
  });

  it("only refuses a delivery on an explicit reproduction failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(502, { success: false, message: "down" })));
    await expect(verifyManifest(ID)).rejects.toMatchObject({ status: 502 });

    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { success: true, data: {} })));
    await expect(verifyManifest(ID)).resolves.toEqual({ reproducible: true });

    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { success: true, data: { reproducible: false } })));
    await expect(verifyManifest(ID)).resolves.toEqual({ reproducible: false });
  });

  it("does nothing with the flag off", async () => {
    realOverride.uploads = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadArchive(ID, new File(["x"], "a.zip"))).rejects.toThrow(/switched off/);
    await expect(buildManifest(ID)).rejects.toThrow(/switched off/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
