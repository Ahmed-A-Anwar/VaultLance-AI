import { describe, expect, it } from "vitest";
import { toSignedDownload, toVaultFile } from "./fileAdapter";

describe("fileAdapter", () => {
  it("reads an audit-detail file row", () => {
    expect(toVaultFile({ id: "f1", name: "logo-primary.png", kind: "file", meta: "2.1 MB" })).toEqual({
      id: "f1",
      name: "logo-primary.png",
      kind: "file",
      meta: "2.1 MB",
    });
  });

  it("reads an uploads-list file row and defaults the rest", () => {
    expect(toVaultFile({ id: "f2", fileName: "delivery.zip", fileSize: 4096 })).toEqual({
      id: "f2",
      name: "delivery.zip",
      kind: "file",
      meta: "",
    });
  });

  it("keeps a url row a url", () => {
    expect(toVaultFile({ id: "f3", name: "staging.app", kind: "url" })?.kind).toBe("url");
  });

  it("refuses a row with no id or no name", () => {
    expect(toVaultFile({ name: "x" })).toBeNull();
    expect(toVaultFile({ id: "f4" })).toBeNull();
    expect(toVaultFile(null)).toBeNull();
  });

  it("accepts only https signed downloads", () => {
    expect(toSignedDownload({ url: "https://x.supabase.co/a?token=1", fileName: "a.zip", expiresIn: 60 })).toEqual({
      url: "https://x.supabase.co/a?token=1",
      fileName: "a.zip",
      expiresIn: 60,
    });
    expect(toSignedDownload({ url: "http://x.supabase.co/a" })).toBeNull();
    expect(toSignedDownload({ url: "javascript:alert(1)" })).toBeNull();
    expect(toSignedDownload({ url: "" })).toBeNull();
    expect(toSignedDownload({})).toBeNull();
  });

  it("defaults the download name and lifetime when the server omits them", () => {
    const d = toSignedDownload({ url: "https://x.supabase.co/a" });
    expect(d?.fileName).toBe("download");
    expect(d?.expiresIn).toBe(60);
  });
});
