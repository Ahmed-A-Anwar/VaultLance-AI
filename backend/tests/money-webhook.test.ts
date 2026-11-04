import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { inMemoryStore } from "../src/shared/db.js";

const paypal = vi.hoisted(() => ({
  getCapture: vi.fn(),
  captureAuthorization: vi.fn(),
  createPayout: vi.fn(),
}));
vi.mock("../src/paypal/payments.client.js", () => paypal);

const { createWebhookRouter } = await import("../src/paypal/webhook.routes.js");
const store = await import("../src/money/money.store.js");

const VAULT = "vault-hook-1";
const FREELANCER = "user-freelancer-hook";

const buildApp = (valid: boolean) => {
  const app = express();
  app.use(
    "/api/webhooks/paypal",
    express.raw({ type: "*/*" }),
    createWebhookRouter({ verify: async () => valid })
  );
  return app;
};

const captureEvent = (id: string) => ({
  id,
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: "cap-1", custom_id: VAULT, status: "COMPLETED" },
});

const settle = async () => {
  for (let i = 0; i < 50 && store.memory.payouts.size === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe("webhook – signature and dedupe", () => {
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
      title: "Hook",
      description: "test",
      amount: 250,
      currency: "USD",
      status: "CAPTURE_PENDING",
      created_at: new Date(),
      updated_at: new Date(),
    });

    paypal.getCapture.mockReset();
    paypal.createPayout.mockReset();
    paypal.getCapture.mockResolvedValue({
      id: "cap-1",
      status: "COMPLETED",
      amountCents: 25000,
      currency: "USD",
      feeCents: 1000,
      netCents: 24000,
    });
    paypal.createPayout.mockResolvedValue({ batchId: "b", itemId: "i", status: "PENDING" });
  });

  it("rejects an invalid signature with 400 and no detail", async () => {
    const res = await request(buildApp(false)).post("/api/webhooks/paypal").send(captureEvent("evt-bad"));
    expect(res.status).toBe(400);
    expect(store.memory.events.size).toBe(0);
  });

  it("answers a duplicate event 200 without doing the work twice", async () => {
    const app = buildApp(true);
    const first = await request(app).post("/api/webhooks/paypal").send(captureEvent("evt-1"));
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("PROCESSED");

    await settle();
    const second = await request(app).post("/api/webhooks/paypal").send(captureEvent("evt-1"));
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("ALREADY_PROCESSED");
    expect(paypal.createPayout).toHaveBeenCalledTimes(1);
  });

  it("ignores a capture that names another vault's authorization", async () => {
    await store.rememberAuthorization(VAULT, "auth-own");
    const app = buildApp(true);

    await request(app)
      .post("/api/webhooks/paypal")
      .send({
        id: "evt-other",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "cap-foreign",
          custom_id: VAULT,
          supplementary_data: { related_ids: { authorization_id: "auth-someone-else" } },
        },
      });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.memory.captures.size).toBe(0);
    expect(inMemoryStore.vaults.get(VAULT)!.status).toBe("CAPTURE_PENDING");
  });
});
