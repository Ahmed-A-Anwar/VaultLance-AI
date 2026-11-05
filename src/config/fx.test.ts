import { afterEach, describe, expect, it } from "vitest";
import { FX_REAL_API, realOn, realOverride, type RealGroup } from "./fx";

/* the nine groups, in the order fx.ts declares them */

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

  it("ships the wired groups on", () => {
    for (const group of ["auth", "vaultsRead", "vaultsWrite", "uploads", "audit", "settings", "payments"] as RealGroup[]) {
      expect(realOn(group)).toBe(true);
    }
  });

  it("keeps the two gaps off, whatever the master says", () => {
    expect(realOn("events")).toBe(false);
    expect(realOn("payouts")).toBe(false);
  });

  it("follows the master switch for a group with no default of its own", () => {
    /* VITE_USE_REAL_API is unset in a test run, so the master itself is off */
    expect(FX_REAL_API).toBe(false);
    expect(realOn("payouts")).toBe(false);
  });

  it("lets a per-function override win over everything, in either direction", () => {
    realOverride.auth = false;
    expect(realOn("auth")).toBe(false);
    realOverride.events = true;
    expect(realOn("events")).toBe(true);
  });

  it("keeps unrelated groups as they were while one is overridden", () => {
    realOverride.payments = false;
    expect(realOn("payments")).toBe(false);
    expect(realOn("vaultsRead")).toBe(true);
    expect(realOn("uploads")).toBe(true);
    expect(realOn("events")).toBe(false);
  });
});
