import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";
import * as store from "../src/money/money.store.js";

const CAPTURE = {
  status: "COMPLETED",
  grossCents: 25_000,
  feeCents: 1_000,
  netCents: 24_000,
  payoutCents: 22_750,
  confirmedVia: "webhook" as const,
};

describe("payout status — member views and captured fees", () => {
  let freelancerToken: string;
  let clientToken: string;
  let outsiderToken: string;
  let vaultId: string;

  const register = async (email: string, role: "FREELANCER" | "CLIENT") => {
    const res = await request(app).post("/api/auth/register").send({
      email,
      password: "Password123!",
      fullName: email.split("@")[0],
      role,
    });
    expect(res.status).toBe(201);
    return res.body.data.token as string;
  };

  beforeEach(async () => {
    database.reset();
    store.memory.reset();

    freelancerToken = await register("f.payout@vaultlance.io", "FREELANCER");
    clientToken = await register("c.payout@vaultlance.io", "CLIENT");
    outsiderToken = await register("o.payout@vaultlance.io", "CLIENT");

    const created = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ title: "Payout view", amount: 250 });
    expect(created.status).toBe(201);
    vaultId = created.body.data.id;

    const minted = await request(app)
      .post(`/api/vaults/${vaultId}/invite-code`)
      .set("Authorization", `Bearer ${freelancerToken}`);
    expect(minted.status).toBe(201);

    const joined = await request(app)
      .post("/api/vaults/join")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ code: minted.body.data.code });
    expect(joined.status).toBe(200);
  });

  function seedCapture(id = vaultId) {
    store.memory.captures.set(id, {
      vaultId: id,
      captureId: "cap-1",
      ...CAPTURE,
      createdAt: "2026-11-05T10:00:00.000Z",
    });
  }

  function seedPayout(status: string, reason: string | null = null) {
    store.memory.payouts.set(vaultId, {
      vaultId,
      status: status as any,
      amountCents: 22_750,
      currency: "USD",
      senderBatchId: "vl-batch-1",
      payoutItemId: "item-1",
      reason,
      attempt: 2,
      createdAt: "2026-11-05T10:01:00.000Z",
      updatedAt: "2026-11-05T10:02:00.000Z",
    });
  }

  const getPayout = (token: string, id = vaultId) =>
    request(app).get(`/api/vaults/${id}/payout`).set("Authorization", `Bearer ${token}`);

  it("gives the freelancer the status, attempt, cents, item id and timestamps", async () => {
    seedCapture();
    seedPayout("pending");

    const res = await getPayout(freelancerToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      role: "freelancer",
      status: "pending",
      attempt: 2,
      payoutItemId: "item-1",
      cents: { gross: 25_000, vaultlanceFee: 1_250, paypalFee: 1_000, net: 24_000, payout: 22_750 },
      timestamps: { createdAt: "2026-11-05T10:01:00.000Z", updatedAt: "2026-11-05T10:02:00.000Z" },
      failure: null,
    });
  });

  it("gives the client the status and timestamps only", async () => {
    seedCapture();
    seedPayout("failed", "PayPal rejected the payout to maya@example.com");

    const res = await getPayout(clientToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      role: "client",
      status: "failed",
      timestamps: { createdAt: "2026-11-05T10:01:00.000Z", updatedAt: "2026-11-05T10:02:00.000Z" },
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("maya@example.com");
    expect(text).not.toContain("cents");
    expect(text).not.toContain("payoutItemId");
    expect(text).not.toContain("failure");
  });

  it("answers a non-member with the same 404 as a missing vault", async () => {
    seedCapture();
    seedPayout("paid");

    const outsider = await getPayout(outsiderToken);
    const missing = await getPayout(outsiderToken, "00000000-0000-4000-8000-000000000000");
    expect(outsider.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(outsider.body).toEqual(missing.body);
  });

  it("speaks every status without inventing one", async () => {
    seedCapture();
    for (const status of ["none", "creating", "pending", "paid", "failed", "blocked"]) {
      store.memory.payouts.delete(vaultId);
      if (status !== "none") seedPayout(status, status === "failed" ? "insufficient funds" : null);
      const res = await getPayout(freelancerToken);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(status);
    }
  });

  it("sanitizes the failure to a code and one fixed sentence, never the raw reason", async () => {
    seedCapture();
    seedPayout("failed", "PayPal error to maya@example.com\nat payout.service.ts:81: stack trace");

    const res = await getPayout(freelancerToken);
    const failure = res.body.data.failure;
    expect(failure.code).toBe("PAYOUT_EMAIL_MISSING");
    expect(failure.message).toBe("No payout address is available for this account.");
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("maya@example.com");
    expect(text).not.toContain("payout.service.ts");
    expect(text).not.toContain("stack trace");
  });

  it("puts capture fees on the vault only after the capture exists", async () => {
    const before = await request(app)
      .get(`/api/vaults/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`);
    expect(before.status).toBe(200);
    expect(before.body.data.fees).toBeUndefined();

    seedCapture();
    const after = await request(app)
      .get(`/api/vaults/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`);
    expect(after.status).toBe(200);
    expect(after.body.data.fees).toEqual({
      grossCents: 25_000,
      vaultlanceFeeCents: 1_250,
      paypalFeeCents: 1_000,
      netCents: 24_000,
      payoutCents: 22_750,
      source: "captured",
    });
  });
});
