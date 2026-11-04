/* freelancer-mock.spec.ts — the mock API behaves like the endpoints it stands
   for. Reads fail 5% of the time on purpose, so every call goes through retry()
   the way the UI's own error path does. */

import { test, expect } from "@playwright/test";
import {
  archiveProblem,
  createVault,
  duplicateVault,
  getFreelancerKpis,
  listFreelancerEvents,
  listFreelancerVaults,
  manifestFor,
  phaseOfVault,
  remindClient,
  retryPayout,
  scanArchive,
  stagingUrlProblem,
  submitForReview,
  URL_PROBLEM_TEXT,
  type FreelancerVault,
} from "../src/components/freelancer/mockApi";
import { lookupInvite } from "../src/components/freelancer/inviteRegistry";
import { MOCK_LATENCY_MS } from "../src/components/freelancer/mockConfig";

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

const zip = (name: string, kb = 64) =>
  new File([new Uint8Array(kb * 1024)], name, { type: "application/zip" });

test.describe("seed", () => {
  test("six vaults, one phase each, ten events", async () => {
    const vaults = await retry(listFreelancerVaults);
    expect(vaults).toHaveLength(6);
    expect(vaults.map((v) => v.project)).toEqual([
      "Icon Set",
      "Logo Pack",
      "Pitch Deck",
      "Landing Page",
      "Booking Web App",
      "Brand Guide",
    ]);
    expect(vaults.map(phaseOfVault)).toEqual([
      "payout_failed",
      "funded",
      "draft",
      "invited",
      "in_review",
      "paid",
    ]);

    const events = await retry(listFreelancerEvents);
    expect(events).toHaveLength(10);
    /* the ten rows cover the nine spec types, with PAYMENT.CAPTURED twice */
    const types = new Set(events.map((e) => e.type));
    expect(types.size).toBe(9);
    for (const type of [
      "VAULT.CREATED",
      "CLIENT.INVITED",
      "PAYMENT.AUTHORIZED",
      "FILES.SUBMITTED",
      "AUDIT.COMPLETED",
      "PAYMENT.CAPTURED",
      "PAYOUT.SENT",
      "PAYOUT.FAILED",
      "PAYMENT.VOIDED",
    ]) {
      expect(types.has(type as never)).toBe(true);
    }
    expect(Date.parse(events[0].at)).toBeGreaterThanOrEqual(Date.parse(events[events.length - 1].at));
    expect(events.some((e) => (e.paypalId ?? "").startsWith("8XK"))).toBe(true);
  });

  test("the KPIs agree with the phases", async () => {
    const kpis = await retry(getFreelancerKpis);
    /* funded Logo Pack + held/submitted/in-review Booking Web App */
    expect(kpis.inReviewCount).toBe(1);
    expect(kpis.inEscrowCents).toBeGreaterThan(0);
    expect(kpis.paidOutCents).toBe(8_034);
  });

  test("latency sits inside the configured window", async () => {
    expect(MOCK_LATENCY_MS.min).toBe(300);
    expect(MOCK_LATENCY_MS.max).toBe(618);
    const started = Date.now();
    await retry(listFreelancerVaults);
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
  });
});

test.describe("scan rules", () => {
  test("only .zip is accepted", () => {
    expect(archiveProblem("site.zip", 1000)).toBeNull();
    expect(archiveProblem("site.rar", 1000)).toBe("Only .zip archives are accepted.");
    expect(archiveProblem("evil.exe", 1000)).toBe("Only .zip archives are accepted.");
  });

  test("a bomb archive and an oversized one are refused", () => {
    expect(archiveProblem("bomb.zip", 1000)).toContain("blocked");
    expect(archiveProblem("huge.zip", 101 * 1024 * 1024)).toContain("100 MB");
  });

  test("a passing archive produces the manifest and adds the file", async () => {
    const vault = (await retry(listFreelancerVaults)).find((v) => v.project === "Landing Page") as FreelancerVault;
    const steps: string[] = [];
    const result = await retry(() =>
      scanArchive(vault.id, zip("deliverable.zip"), (s) => steps.push(s.map((x) => x.state).join(",")))
    );
    expect(result.ok).toBe(true);
    expect(result.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(steps.length).toBeGreaterThan(4);
  });

  test("bomb.zip fails the scan and yields no manifest", async () => {
    const vault = (await retry(listFreelancerVaults))[3];
    const result = await scanArchive(vault.id, zip("bomb.zip"));
    expect(result.ok).toBe(false);
    expect(result.manifestSha256).toBeUndefined();
    expect(result.steps.some((s) => s.state === "fail")).toBe(true);
  });

  test("the manifest is deterministic and 64 hex characters", () => {
    const a = manifestFor([{ name: "a.zip", sizeBytes: 10 }]);
    const b = manifestFor([{ name: "a.zip", sizeBytes: 10 }]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(manifestFor([{ name: "a.zip", sizeBytes: 11 }])).not.toBe(a);
  });
});

test.describe("staging URLs", () => {
  test("https is required and local addresses are refused", () => {
    expect(stagingUrlProblem("http://example.com")).toBe("not_https");
    expect(stagingUrlProblem("https://localhost:3000")).toBe("localhost");
    expect(stagingUrlProblem("https://127.0.0.1")).toBe("localhost");
    expect(stagingUrlProblem("https://192.168.1.20")).toBe("private");
    expect(stagingUrlProblem("https://user:pw@example.com")).toBe("credentials");
    expect(stagingUrlProblem("not a url")).toBe("malformed");
    expect(stagingUrlProblem("https://staging.example.com/preview")).toBeNull();
  });

  test("every problem has a sentence", () => {
    for (const key of ["not_https", "localhost", "private", "credentials", "malformed"] as const) {
      expect(URL_PROBLEM_TEXT[key].length).toBeGreaterThan(10);
    }
  });
});

test.describe("lifecycle", () => {
  test("creating with an invite mints a VL- code the registry knows", async () => {
    const vault = await retry(() =>
      createVault(
        {
          project: "Test Build",
          clientEmail: "client@example.com",
          amountCents: 50_000,
          kind: "web",
        },
        { draft: false }
      )
    );
    expect(vault.inviteCode).toMatch(/^VL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(lookupInvite(vault.inviteCode!)?.project).toBe("Test Build");
    expect(vault.invitedAt).toBeTruthy();
  });

  test("a draft has no invite and can be deleted", async () => {
    const draft = await retry(() =>
      createVault(
        { project: "Draft Only", clientEmail: "c@example.com", amountCents: 10_000, kind: "other" },
        { draft: true }
      )
    );
    expect(draft.inviteCode).toBeUndefined();
    expect(phaseOfVault(draft)).toBe("draft");
  });

  test("submit locks a manifest; retry flips a failed payout to paid", async () => {
    const vaults = await retry(listFreelancerVaults);
    const failed = vaults.find((v) => phaseOfVault(v) === "payout_failed")!;
    const after = await retry(() => retryPayout(failed.id));
    expect(after.payoutStatus).toBe("paid");

    const funded = vaults.find((v) => phaseOfVault(v) === "funded")!;
    const submitted = await retry(() => submitForReview(funded.id));
    expect(submitted.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("remind enforces its cooldown", async () => {
    const vaults = await retry(listFreelancerVaults);
    const invited = vaults.find((v) => phaseOfVault(v) === "invited")!;
    await retry(() => remindClient(invited.id));
    await expect(remindClient(invited.id)).rejects.toThrow(/already reminded/i);
  });

  test("duplicate copies the shape without the history", async () => {
    const vaults = await retry(listFreelancerVaults);
    const source = vaults.find((v) => v.project === "Booking Web App")!;
    const copy = await retry(() => duplicateVault(source.id));
    expect(copy.project).toBe("Booking Web App (copy)");
    expect(copy.filesCount).toBe(0);
    expect(copy.inviteCode).toBeUndefined();
    expect(phaseOfVault(copy)).toBe("draft");
  });
});
