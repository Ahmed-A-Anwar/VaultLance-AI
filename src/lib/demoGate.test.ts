import { describe, expect, it } from "vitest";
import { demoAllowedInBuild } from "./demoGate";

describe("demo gate", () => {
  it("is closed in a production build with no opt-in flag", () => {
    expect(demoAllowedInBuild(false, undefined)).toBe(false);
    expect(demoAllowedInBuild(false, "false")).toBe(false);
    expect(demoAllowedInBuild(false, "")).toBe(false);
  });

  it("is open in a dev build", () => {
    expect(demoAllowedInBuild(true, undefined)).toBe(true);
  });

  it("is open only for an explicit opt-in build", () => {
    expect(demoAllowedInBuild(false, "true")).toBe(true);
  });
});
