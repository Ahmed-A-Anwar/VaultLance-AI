import { test, expect } from "@playwright/test";
import {
  scanProblem,
  validateStagingUrl,
  manifestHash,
  createVault,
  resetMockStore,
  listFreelancerVaults,
  getFreelancerKpis,
  phaseOfVault,
} from "../src/components/freelancer/mockApi";
import { newInviteCode } from "../src/components/freelancer/inviteRegistry";
import { ARCHIVE_LIMITS } from "../src/components/freelancer/mockConfig";

/* The mock API is import-safe outside a browser: every storage call is guarded,
   so these run in Node with the seeded store. */

test.describe("archive scan rules", () => {
  test("a .zip of a sensible size passes", () => {
    expect(scanProblem({ name: "site.zip", sizeBytes: 5_000_000 })).toBeNull();
  });

  test("anything that is not a .zip is refused", () => {
    expect(scanProblem({ name: "site.rar", sizeBytes: 1000 })).toBe("Only .zip archives are accepted.");
    expect(scanProblem({ name: "installer.exe", sizeBytes: 1000 })).toBe("Only .zip archives are accepted.");
  });

  test("an archive over the compressed cap is refused with the limit", () => {
    const tooBig = ARCHIVE_LIMITS.maxCompressedBytes + 1;
    expect(scanProblem({ name: "big.zip", sizeBytes: tooBig })).toContain("MB are rejected");
  });

  test("a name that says bomb fails", () => {
    expect(scanProblem({ name: "bomb.zip", sizeBytes: 900 })).toContain("refused");
    expect(scanProblem({ name: "photo-bomb.zip", sizeBytes: 900 })).toContain("refused");
  });
});

test.describe("staging URL rules", () => {
  const bad = (url: string) => {
    const r = validateStagingUrl(url);
    expect(r.ok, `${url} should be refused`).toBe(false);
    return r.ok === false ? r.reason : "";
  };

  test("only https", () => {
    expect(bad("http://localhost:3000")).toContain("https");
    bad("http://example.com");
  });

  test("loopback and private ranges are refused", () => {
    for (const url of [
      "https://localhost",
      "https://localhost:3000",
      "https://app.localhost",
      "https://127.0.0.1",
      "https://10.0.0.4",
      "https://192.168.1.20",
      "https://172.16.4.1",
      "https://169.254.169.254",
    ]) {
      bad(url);
    }
  });

  test("credentials in the URL are refused", () => {
    expect(bad("https://user:pass@example.com")).toContain("username");
  });

  test("a bare host with no dot is not public", () => {
    bad("https://intranet");
  });

  test("a real https URL passes", () => {
    const r = validateStagingUrl("https://preview.acme.dev/build/42");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe("https://preview.acme.dev/build/42");
  });
});

test.describe("manifest hash", () => {
  const files = [
    { name: "a.png", sizeBytes: 10 },
    { name: "b.css", sizeBytes: 20 },
  ];

  test("is 64 hex characters", () => {
    expect(manifestHash(files)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic and order-sensitive", () => {
    expect(manifestHash(files)).toBe(manifestHash(files));
    expect(manifestHash(files)).not.toBe(manifestHash([...files].reverse()));
  });
});

test.describe("invite codes", () => {
  test("are VL-XXXX-XXXX with no look-alike characters", () => {
    for (let i = 0; i < 25; i++) {
      expect(newInviteCode()).toMatch(/^VL-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });
});

test.describe("the seeded store", () => {
  test("has six vaults and every phase the spec seeded", async () => {
    resetMockStore();
    const list = await listFreelancerVaults();
    expect(list).toHaveLength(6);
    const phases = list.map(phaseOfVault).sort();
    expect(phases).toEqual(["draft", "funded", "in_review", "invited", "paid", "payout_failed"]);
  });

  test("the KPIs describe that seed", async () => {
    resetMockStore();
    const k = await getFreelancerKpis();
    /* held $180 -> 16098c and audited $2,400 -> 215010c, minus fees */
    expect(k.inEscrowCents).toBe(16_098 + 215_010);
    /* only the audited Booking Web App is awaiting a decision: Brand Guide and
       Icon Set keep their submittedAt but are already paid */
    expect(k.inReview).toBe(1);
    expect(k.paidOutCents).toBe(8_034);
  });

  test("a $1 vault is refused before it is created", async () => {
    await expect(
      createVault({ project: "Tiny", clientEmail: "a@b.co", amountCents: 100, kind: "other" })
    ).rejects.toThrow(/minimum/i);
  });
});
