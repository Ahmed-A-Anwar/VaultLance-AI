import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { inMemoryStore } from "../src/shared/db.js";
import { signToken } from "../src/auth/jwt.js";
import { sessionStore } from "../src/auth/session.store.js";

const paypal = vi.hoisted(() => ({
  voidAuthorization: vi.fn(),
  getAuthorization: vi.fn(),
}));
vi.mock("../src/paypal/paypal.client.js", () => ({ paypalService: paypal }));

const { default: vaultActions } = await import("../src/vaults/vault.actions.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const store = await import("../src/money/money.store.js");

const VAULT = "vault-reject-1";
const CLIENT = "user-client-reject";
const FREELANCER = "user-freelancer-reject";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/vaults", vaultActions);
  app.use(errorHandler);
  return app;
};

async function tokenFor(userId: string, role: "CLIENT" | "FREELANCER"): Promise<string> {
  const sessionId = `session-${userId}`;
  const token = signToken({
    userId,
    email: `${userId}@example.com`,
    role,
    fullName: role,
    sessionId,
  });
  await sessionStore.createSession(userId, token, undefined, undefined, sessionId);
  return token;
}

function seed(status = "AWAITING_APPROVAL") {
  inMemoryStore.clear();
  store.memory.reset();

  inMemoryStore.users.set(CLIENT, {
    id: CLIENT,
    email: "client@example.com",
    password_hash: "x",
    full_name: "Client",
    role: "CLIENT",
    account_status: "ACTIVE",
    created_at: new Date(),
    updated_at: new Date(),
  });
  inMemoryStore.users.set(FREELANCER, {
    id: FREELANCER,
    email: "freelancer@example.com",
    password_hash: "x",
    full_name: "Freelancer",
    role: "FREELANCER",
    account_status: "ACTIVE",
    created_at: new Date(),
    updated_at: new Date(),
  });
  inMemoryStore.vaults.set(VAULT, {
    id: VAULT,
    freelancer_id: FREELANCER,
    title: "Reject me",
    description: "test",
    amount: 250,
    currency: "USD",
    status: status as any,
    created_at: new Date(),
    updated_at: new Date(),
  });
  inMemoryStore.members.set("m-client", {
    id: "m-client",
    vault_id: VAULT,
    user_id: CLIENT,
    role: "CLIENT",
    invitation_status: "ACCEPTED",
    created_at: new Date(),
  });

  paypal.voidAuthorization.mockReset();
  paypal.getAuthorization.mockReset();
  paypal.voidAuthorization.mockResolvedValue({ status: "VOIDED", raw: {} });
  paypal.getAuthorization.mockResolvedValue({ id: "AUTH-1", status: "CREATED", amount: 250, currency: "USD" });
}

describe("B4 – reject voids the PayPal hold", () => {
  beforeEach(() => seed());

  it("voids once, then cancels and records the authorization id", async () => {
    await store.rememberAuthorization(VAULT, "AUTH-1");
    const token = await tokenFor(CLIENT, "CLIENT");

    const res = await request(buildApp())
      .post(`/api/vaults/${VAULT}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(paypal.voidAuthorization).toHaveBeenCalledTimes(1);
    expect(paypal.voidAuthorization.mock.calls[0][0]).toBe("AUTH-1");
    expect(inMemoryStore.vaults.get(VAULT)!.status).toBe("CANCELLED");

    const cancelled = store.memory.ledger.filter((row) => row.event_type === "VAULT_CANCELLED");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].metadata.authorizationId).toBe("AUTH-1");
  });

  it("is idempotent: a second reject returns the same result without voiding again", async () => {
    await store.rememberAuthorization(VAULT, "AUTH-1");
    const token = await tokenFor(CLIENT, "CLIENT");
    const app = buildApp();

    await request(app).post(`/api/vaults/${VAULT}/reject`).set("Authorization", `Bearer ${token}`).send({});
    const second = await request(app)
      .post(`/api/vaults/${VAULT}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(second.status).toBe(200);
    expect(paypal.voidAuthorization).toHaveBeenCalledTimes(1);
    expect(store.memory.ledger.filter((row) => row.event_type === "VAULT_CANCELLED")).toHaveLength(1);
  });

  it("keeps the vault unchanged when the void fails", async () => {
    await store.rememberAuthorization(VAULT, "AUTH-1");
    paypal.voidAuthorization.mockRejectedValue(new Error("network down"));
    paypal.getAuthorization.mockResolvedValue({ id: "AUTH-1", status: "CREATED", amount: 250, currency: "USD" });
    const token = await tokenFor(CLIENT, "CLIENT");

    const res = await request(buildApp())
      .post(`/api/vaults/${VAULT}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("VOID_FAILED");
    expect(inMemoryStore.vaults.get(VAULT)!.status).toBe("AWAITING_APPROVAL");
    expect(store.memory.ledger).toHaveLength(0);
  });

  it("continues when PayPal reports the authorization already voided", async () => {
    await store.rememberAuthorization(VAULT, "AUTH-1");
    paypal.voidAuthorization.mockRejectedValue(new Error("AUTHORIZATION_ALREADY_VOIDED"));
    paypal.getAuthorization.mockResolvedValue({ id: "AUTH-1", status: "VOIDED", amount: 250, currency: "USD" });
    const token = await tokenFor(CLIENT, "CLIENT");

    const res = await request(buildApp())
      .post(`/api/vaults/${VAULT}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(inMemoryStore.vaults.get(VAULT)!.status).toBe("CANCELLED");
  });

  it("refuses to void after the money was captured", async () => {
    seed("PAID");
    await store.saveCaptureOnce({
      vaultId: VAULT,
      captureId: "CAP-1",
      status: "COMPLETED",
      grossCents: 25000,
      feeCents: 1000,
      netCents: 24000,
      payoutCents: 22750,
      confirmedVia: "approve",
    });
    const token = await tokenFor(CLIENT, "CLIENT");

    const res = await request(buildApp())
      .post(`/api/vaults/${VAULT}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_CAPTURED");
    expect(paypal.voidAuthorization).not.toHaveBeenCalled();
  });

  it("refuses a freelancer who is only the owner", async () => {
    await store.rememberAuthorization(VAULT, "AUTH-1");
    const token = await tokenFor(FREELANCER, "FREELANCER");

    const res = await request(buildApp())
      .post(`/api/vaults/${VAULT}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CLIENT_ROLE_REQUIRED");
    expect(paypal.voidAuthorization).not.toHaveBeenCalled();
  });
});
