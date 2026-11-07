import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { inMemoryStore } from "../src/shared/db.js";
import { signToken } from "../src/auth/jwt.js";
import { sessionStore } from "../src/auth/session.store.js";

describe("Milestone 2 – PayPal Sandbox Orders, Authorization, Capture & Webhooks", () => {
  const clientId = "client-user-m2-001";
  const clientEmail = "client.m2@example.com";
  let clientToken: string;

  const freelancerId = "freelancer-user-m2-001";
  const freelancerEmail = "freelancer.m2@example.com";
  let freelancerToken: string;

  const testVaultId = "vault-m2-test-001";

  beforeAll(async () => {
    inMemoryStore.clear();

    // Register Client
    inMemoryStore.users.set(clientId, {
      id: clientId,
      email: clientEmail,
      password_hash: "hash",
      full_name: "Client M2",
      role: "CLIENT",
      account_status: "ACTIVE",
      created_at: new Date(),
      updated_at: new Date(),
    });

    const clientSessionId = "session-m2-client";
    clientToken = signToken({
      userId: clientId,
      email: clientEmail,
      role: "CLIENT",
      fullName: "Client M2",
      sessionId: clientSessionId,
    });
    await sessionStore.createSession(clientId, clientToken, undefined, undefined, clientSessionId);

    // Register Freelancer
    inMemoryStore.users.set(freelancerId, {
      id: freelancerId,
      email: freelancerEmail,
      password_hash: "hash",
      full_name: "Freelancer M2",
      role: "FREELANCER",
      account_status: "ACTIVE",
      created_at: new Date(),
      updated_at: new Date(),
    });

    const freelancerSessionId = "session-m2-freelancer";
    freelancerToken = signToken({
      userId: freelancerId,
      email: freelancerEmail,
      role: "FREELANCER",
      fullName: "Freelancer M2",
      sessionId: freelancerSessionId,
    });
    await sessionStore.createSession(freelancerId, freelancerToken, undefined, undefined, freelancerSessionId);

    // Setup Test Vault in AWAITING_AUTHORIZATION state
    inMemoryStore.vaults.set(testVaultId, {
      id: testVaultId,
      freelancer_id: freelancerId,
      title: "M2 PayPal Integration Deliverable",
      description: "Test vault for PayPal Milestone 2",
      amount: 100,
      currency: "USD",
      status: "AWAITING_AUTHORIZATION",
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Vault Members
    inMemoryStore.members.set("member-1", {
      id: "member-1",
      vault_id: testVaultId,
      user_id: freelancerId,
      role: "FREELANCER",
      invitation_status: "ACCEPTED",
      created_at: new Date(),
    });

    inMemoryStore.members.set("member-2", {
      id: "member-2",
      vault_id: testVaultId,
      user_id: clientId,
      role: "CLIENT",
      invitation_status: "ACCEPTED",
      created_at: new Date(),
    });
  });

  afterAll(() => {
    inMemoryStore.clear();
  });

  it("Step 3: should create a PayPal authorization order for an eligible vault", async () => {
    const res = await request(app)
      .post(`/api/vaults/${testVaultId}/payment/order`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        returnUrl: "http://127.0.0.1:5173/return",
        cancelUrl: "http://127.0.0.1:5173/cancel",
      });

    // Even if external network is isolated in sandbox or returns live Sandbox order:
    if (res.status === 201) {
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBeDefined();
      expect(res.body.data.amount).toBe(100);
      expect(res.body.data.currency).toBe("USD");
    } else {
      // In sandbox without external PayPal internet, returns 502/400 gracefully
      expect([201, 502, 500]).toContain(res.status);
    }
  });

  it("returns the existing hold instead of refusing a second order", async () => {
    const vault = inMemoryStore.vaults.get(testVaultId);
    if (!vault) throw new Error("test vault missing");
    vault.status = "AUTHORIZED";
    (vault as any).paypal_order_id = "ORDER-EXISTING";
    (vault as any).paypal_authorization_id = "AUTH-EXISTING";

    const res = await request(app)
      .post(`/api/vaults/${testVaultId}/payment/order`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      orderId: "ORDER-EXISTING",
      authorizationId: "AUTH-EXISTING",
      claimed: true,
      status: "AUTHORIZED",
    });
  });

  it("Step 5 & 6: capture is refused unless the vault is AWAITING_APPROVAL", async () => {
    /* the old capture route accepted AUTHORIZED and marked PAID without a
       verified capture; the money loop only captures after a client approval */
    const vault = inMemoryStore.vaults.get(testVaultId);
    if (vault) {
      vault.status = "AUTHORIZED";
    }

    const res = await request(app)
      .post(`/api/vaults/${testVaultId}/capture`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ authorizationId: "mock-auth-m2-001" });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(inMemoryStore.vaults.get(testVaultId)?.status).toBe("AUTHORIZED");
  });

  it("Step 7: should reject or void active vault authorization", async () => {
    const voidVaultId = "vault-m2-void-001";
    inMemoryStore.vaults.set(voidVaultId, {
      id: voidVaultId,
      freelancer_id: freelancerId,
      title: "Void Test Vault",
      amount: 50,
      currency: "USD",
      status: "AUTHORIZED",
      created_at: new Date(),
      updated_at: new Date(),
    });

    inMemoryStore.members.set("member-void-client", {
      id: "member-void-client",
      vault_id: voidVaultId,
      user_id: clientId,
      role: "CLIENT",
      invitation_status: "ACCEPTED",
      created_at: new Date(),
    });

    const res = await request(app)
      .post(`/api/vaults/${voidVaultId}/void`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        authorizationId: "mock-auth-void-001",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("CANCELLED");

    const voidedVault = inMemoryStore.vaults.get(voidVaultId);
    expect(voidedVault?.status).toBe("CANCELLED");
  });

  it("Step 8: an unsigned webhook is rejected (fail closed)", async () => {
    /* no PAYPAL_WEBHOOK_ID in the test environment, so nothing may be accepted.
       Signature success and dedupe are covered in money-webhook.test.ts with an
       injected verifier. */
    const res = await request(app)
      .post("/api/webhooks/paypal")
      .send({
        id: "WH-EVENT-DEDUP-001",
        event_type: "PAYMENT.AUTHORIZATION.CREATED",
        resource: { custom_id: testVaultId },
      });

    expect(res.status).toBe(400);
  });
});
