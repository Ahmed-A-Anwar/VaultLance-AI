import { describe, expect, it } from "vitest";
import { normalizeInviteCode } from "./inviteCode";

describe("normalizeInviteCode", () => {
  it("trims, uppercases and keeps the dashed form", () => {
    expect(normalizeInviteCode("  vl-7k2q-9xmd ")).toBe("VL-7K2Q-9XMD");
  });

  it("accepts a code typed without dashes", () => {
    expect(normalizeInviteCode("vl7k2q9xmd")).toBe("VL-7K2Q-9XMD");
  });

  it("accepts spaces instead of dashes", () => {
    expect(normalizeInviteCode("VL 7K2Q 9XMD")).toBe("VL-7K2Q-9XMD");
  });

  it("rejects anything that is not a twelve-character VL code", () => {
    expect(normalizeInviteCode("DEMO-1234")).toBeNull();
    expect(normalizeInviteCode("VL-7K2Q")).toBeNull();
    expect(normalizeInviteCode("")).toBeNull();
    expect(normalizeInviteCode("VL-7K2Q-9XMDX")).toBeNull();
  });
});
