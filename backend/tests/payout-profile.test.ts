import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const paypal = vi.hoisted(() => ({
  createPayout: vi.fn(),
  getCapture: vi.fn(),
  captureAuthorization: vi.fn(),
}));
vi.mock("../src/paypal/payments.client.js", () => paypal);

const { app } = await import("../src/app.js");
const { database, inMemoryStore } = await import("../src/shared/db.js");
const store = await import("../src/money/money.store.js");
const { ensurePayout } = await import("../src/money/payout.service.js");

const PASSWORD = "Password123!";

describe("payout profile — one field, freelancer only", () => {
  let freelancerToken: string;
  let clientToken: string;
  let freelancerEmail: string;

  const register = async (email: string, role: "FREELANCER" | "CLIENT") => {
    const res = await request(app).post("/api/auth/register").send({
      email,
      password: PASSWORD,
      fullName: "Profile User",
      role,
    });
    expect(res.status).toBe(201);
    return res.body.data.token as string;
  };

  beforeEach(async () => {
    database.reset();
    store.memory.reset();
    freelancerEmail = "f.profile@vaultlance.io";
    freelancerToken = await register(freelancerEmail, "FREELANCER");
    clientToken = await register("c.profile@vaultlance.io", "CLIENT");
  });

  const get = (token: string) =>
    request(app).get("/api/auth/me/payout-profile").set("Authorization", `Bearer ${token}`);
  const put = (token: string, body: unknown) =>
    request(app).put("/api/auth/me/payout-profile").set("Authorization", `Bearer ${token}`).send(body as any);

  it("sets and reads the address, lowercased", async () => {
    const empty = await get(freelancerToken);
    expect(empty.status).toBe(200);
    expect(empty.body.data.paypalEmail).toBeNull();

    const saved = await put(freelancerToken, { paypalEmail: "  Maya@PayPal.Example " });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ paypalEmail: "maya@paypal.example", verified: true });

    const read = await get(freelancerToken);
    expect(read.body.data.paypalEmail).toBe("maya@paypal.example");
    const last = store.memory.ledger[store.memory.ledger.length - 1];
    expect(last?.metadata).toMatchObject({
      field: "paypal_payout_email",
      next: "m***@paypal.example",
    });
    expect(JSON.stringify(last?.metadata)).not.toContain("maya@paypal.example");
  });

  it("refuses a client with 403 on both verbs", async () => {
    expect((await get(clientToken)).status).toBe(403);
    expect((await put(clientToken, { paypalEmail: "client@example.com" })).status).toBe(403);
  });

  it("rejects an invalid address with 400", async () => {
    expect((await put(freelancerToken, { paypalEmail: "not-an-email" })).status).toBe(400);
    expect((await put(freelancerToken, { paypalEmail: `${"a".repeat(250)}@x.com` })).status).toBe(400);
  });

  it("accepts only paypalEmail and ignores extra fields", async () => {
    const res = await put(freelancerToken, {
      paypalEmail: "only@example.com",
      fullName: "Renamed",
      role: "CLIENT",
    });
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty("fullName");
    const user = Array.from(database.store.users.values()).find((u) => u.email === freelancerEmail)!;
    expect(user.full_name).toBe("Profile User");
    expect(user.paypal_payout_email).toBe("only@example.com");
  });

  it("freezes the address while a payout is creating or pending", async () => {
    const created = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ title: "Moving money", amount: 250 });
    expect(created.status).toBe(201);

    store.memory.payouts.set(created.body.data.id, {
      vaultId: created.body.data.id,
      status: "pending",
      amountCents: 20_000,
      currency: "USD",
      senderBatchId: "vl-1",
      payoutItemId: "item-1",
      reason: null,
      attempt: 1,
    });

    const res = await put(freelancerToken, { paypalEmail: "new@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PAYOUT_IN_PROGRESS");
    expect((await get(freelancerToken)).body.data.paypalEmail).toBeNull();
  });

  it("lists the vaults blocking deletion, with a title capped at 60 chars", async () => {
    const title = "A vault title that is deliberately much longer than sixty characters in total";
    const created = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ title, amount: 100 });
    expect(created.status).toBe(201);
    database.store.vaults.get(created.body.data.id)!.status = "AUTHORIZED";

    const res = await request(app)
      .delete("/api/auth/me")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ email: freelancerEmail });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DELETE_BLOCKED");
    const blockers = res.body.error.details.blockers;
    expect(Array.isArray(blockers)).toBe(true);
    expect(blockers[0]).toMatchObject({ id: created.body.data.id, status: "AUTHORIZED" });
    expect(blockers[0].title.length).toBe(60);
  });
});

describe("ensurePayout reads the stored address", () => {
  const FREELANCER = "user-payout-email";
  const VAULT = "vault-payout-email";

  function seed(stored: string | null) {
    inMemoryStore.clear();
    store.memory.reset();
    inMemoryStore.users.set(FREELANCER, {
      id: FREELANCER,
      email: "login@example.com",
      password_hash: "x",
      full_name: "Payout Email",
      role: "FREELANCER",
      account_status: "ACTIVE",
      paypal_payout_email: stored,
      created_at: new Date(),
      updated_at: new Date(),
    });
    inMemoryStore.vaults.set(VAULT, {
      id: VAULT,
      freelancer_id: FREELANCER,
      title: "Payout email",
      description: "test",
      amount: 250,
      currency: "USD",
      status: "AUTHORIZED",
      created_at: new Date(),
      updated_at: new Date(),
    });
    store.memory.captures.set(VAULT, {
      vaultId: VAULT,
      captureId: "cap-1",
      status: "COMPLETED",
      grossCents: 25_000,
      feeCents: 1_000,
      netCents: 24_000,
      payoutCents: 22_750,
      confirmedVia: "webhook",
    });
    paypal.createPayout.mockReset();
    paypal.createPayout.mockResolvedValue({ batchId: "batch", itemId: "item", status: "PENDING" });
  }

  beforeEach(() => seed("payout@example.com"));

  it("sends to the stored payout address", async () => {
    await ensurePayout(VAULT);
    expect(paypal.createPayout).toHaveBeenCalledWith(expect.objectContaining({ receiverEmail: "payout@example.com" }));
  });

  it("falls back to the login email when the profile is empty", async () => {
    seed(null);
    await ensurePayout(VAULT);
    expect(paypal.createPayout).toHaveBeenCalledWith(expect.objectContaining({ receiverEmail: "login@example.com" }));
  });
});
