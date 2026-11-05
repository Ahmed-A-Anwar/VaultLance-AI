import { afterEach, describe, expect, it } from "vitest";
import { FX_REAL_API, FX_REAL_DEFAULTS, realOn, realOverride, type RealGroup } from "./fx";

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

  it("ships every wired group on", () => {
    for (const group of GROUPS) {
      expect(realOn(group)).toBe(true);
    }
  });

  it("gives every group an explicit default, so none rides the master switch by accident", () => {
    /* an absent group would follow VITE_USE_REAL_API, which is how a group nobody
       wired could be switched on by a build flag alone */
    for (const group of GROUPS) {
      expect(FX_REAL_DEFAULTS[group]).toBe(true);
    }
  });

  it("reads the ledger and payouts groups as wired, now that the server scopes and retries", () => {
    /* events: GET /api/ledger filters to the caller's own vaults.
       payouts: POST /api/vaults/:id/payout/retry answers failed rows only. */
    expect(realOn("events")).toBe(true);
    expect(realOn("payouts")).toBe(true);
  });

  it("still follows the master switch for a group with no default", () => {
    /* VITE_USE_REAL_API is unset in a test run, so the master itself is off */
    expect(FX_REAL_API).toBe(false);
    const undeclared: RealGroup = "payouts";
    const saved = FX_REAL_DEFAULTS[undeclared];
    delete (FX_REAL_DEFAULTS as Record<RealGroup, boolean | undefined>)[undeclared];
    try {
      expect(realOn(undeclared)).toBe(false);
    } finally {
      (FX_REAL_DEFAULTS as Record<RealGroup, boolean | undefined>)[undeclared] = saved;
    }
  });

  it("lets a per-function override win over everything, in either direction", () => {
    realOverride.auth = false;
    expect(realOn("auth")).toBe(false);
    realOverride.events = false;
    expect(realOn("events")).toBe(false);
  });

  it("keeps unrelated groups as they were while one is overridden", () => {
    realOverride.payments = false;
    expect(realOn("payments")).toBe(false);
    expect(realOn("vaultsRead")).toBe(true);
    expect(realOn("uploads")).toBe(true);
    expect(realOn("events")).toBe(true);
  });
});
