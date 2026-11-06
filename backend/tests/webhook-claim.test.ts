import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { inMemoryStore } from "../src/shared/db.js";

const { createWebhookRouter } = await import("../src/paypal/webhook.routes.js");
const { claimAuthorization } = await import("../src/money/claim.service.js");
const store = await import("../src/money/money.store.js");

const VAULT = "vault-claim-1";
const FREELANCER = "user-freelancer-claim";
const ORDER = "ORDER-CLAIM-1";

const buildApp = () => {
  const app = express();
  app.use(
    "/api/webhooks/paypal",
    express.raw({ type: "*/*" }),
    createWebhookRouter({ verify: async () => true })
  );
  return app;
};

const authorizedEvent = (id: string, amount = "250.00", customId = VAULT) => ({
  id,
  event_type: "PAYMENT.AUTHORIZATION.CREATED",
  resource: {
    id: "AUTH-CLAIM-1",
    status: "CREATED",
    amount: { value: amount, currency_code: "USD" },
    custom_id: customId,
    supplementary_data: { related_ids: { order_id: ORDER } },
  },
});

async function settle(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("B7 – a webhook can claim the hold", () => {
  beforeEach(() => {
    inMemoryStore.clear();
    store.memory.reset();

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
      title: "Claim",
      description: "test",
      amount: 250,
      currency: "USD",
      status: "AWAITING_AUTHORIZATION",
      created_at: new Date(),
      updated_at: new Date(),
    });
    (inMemoryStore.vaults.get(VAULT) as any).paypal_order_id = ORDER;
  });

  it("moves the vault to AUTHORIZED without the buyer returning", async () => {
    const res = await request(buildApp()).post("/api/webhooks/paypal").send(authorizedEvent("evt-claim-1"));
    expect(res.status).toBe(200);

    await settle(() => inMemoryStore.vaults.get(VAULT)!.status === "AUTHORIZED");

    expect(inMemoryStore.vaults.get(VAULT)!.status).toBe("AUTHORIZED");
    expect((inMemoryStore.vaults.get(VAULT) as any).paypal_authorization_id).toBe("AUTH-CLAIM-1");
    expect(store.memory.ledger.filter((row) => row.event_type === "FUNDS_AUTHORIZED")).toHaveLength(1);
  });

  it("ignores a duplicate event and keeps one ledger row", async () => {
    const app = buildApp();
    await request(app).post("/api/webhooks/paypal").send(authorizedEvent("evt-dup-1"));
    await settle(() => inMemoryStore.vaults.get(VAULT)!.status === "AUTHORIZED");

    const second = await request(app).post("/api/webhooks/paypal").send(authorizedEvent("evt-dup-1"));
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("ALREADY_PROCESSED");
    expect(store.memory.ledger.filter((row) => row.event_type === "FUNDS_AUTHORIZED")).toHaveLength(1);
  });

  it("ignores an authorization for another amount", async () => {
    await request(buildApp())
      .post("/api/webhooks/paypal")
      .send(authorizedEvent("evt-amount", "260.00"));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(inMemoryStore.vaults.get(VAULT)!.status).toBe("AWAITING_AUTHORIZATION");
    expect(store.memory.ledger).toHaveLength(0);
  });

  it("ignores an unknown vault reference", async () => {
    const res = await request(buildApp())
      .post("/api/webhooks/paypal")
      .send(authorizedEvent("evt-unknown", "250.00", "vault-that-does-not-exist"));

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.memory.ledger).toHaveLength(0);
  });

  it("lets exactly one of two concurrent claims win", async () => {
    const results = await Promise.all([
      claimAuthorization(VAULT, {
        authorizationId: "AUTH-RACE",
        orderId: ORDER,
        amountCents: 25000,
        currency: "USD",
        via: "webhook",
      }),
      claimAuthorization(VAULT, {
        authorizationId: "AUTH-RACE",
        orderId: ORDER,
        amountCents: 25000,
        currency: "USD",
        via: "return",
      }),
    ]);

    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(results.filter((r) => !r.claimed)).toHaveLength(1);
    expect(store.memory.ledger.filter((row) => row.event_type === "FUNDS_AUTHORIZED")).toHaveLength(1);
  });

  it("treats a webhook that arrives after the return route as a no-op", async () => {
    await claimAuthorization(VAULT, {
      authorizationId: "AUTH-CLAIM-1",
      orderId: ORDER,
      amountCents: 25000,
      currency: "USD",
      via: "return",
    });

    await request(buildApp()).post("/api/webhooks/paypal").send(authorizedEvent("evt-after-return"));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(store.memory.ledger.filter((row) => row.event_type === "FUNDS_AUTHORIZED")).toHaveLength(1);
  });
});
