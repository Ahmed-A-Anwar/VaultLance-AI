import { afterEach, describe, expect, it } from "vitest";
import { FX_REAL_API, realOn, realOverride, type RealGroup } from "./fx";

const GROUPS: RealGroup[] = [
  "auth",
  "vaultsRead",
  "vaultsWrite",
  "events",
  "uploads",
  "payments",
  "audit",
  "settings",
  "payouts",
];

describe("FX.real flags", () => {
  afterEach(() => {
    for (const group of GROUPS) delete realOverride[group];
  });

  it("ships every group off, so an untouched build is the mock build", () => {
    for (const group of GROUPS) expect(realOn(group)).toBe(false);
  });

  it("follows the master switch when a group has no default of its own", () => {
    /* VITE_USE_REAL_API is unset in a test run, so the master itself is off */
    expect(FX_REAL_API).toBe(false);
    expect(realOn("vaultsRead")).toBe(false);
  });

  it("lets a per-function override win over everything", () => {
    realOverride.auth = true;
    expect(realOn("auth")).toBe(true);
    realOverride.auth = false;
    expect(realOn("auth")).toBe(false);
  });

  it("keeps unrelated groups off while one is overridden", () => {
    realOverride.payments = true;
    expect(realOn("payments")).toBe(true);
    expect(realOn("vaultsRead")).toBe(false);
    expect(realOn("uploads")).toBe(false);
  });
});
