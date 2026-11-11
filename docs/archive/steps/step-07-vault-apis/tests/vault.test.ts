import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";

describe("Step 6 & 7 – Vault Domain Model, State Machine & APIs", () => {
  let freelancerToken: string;
  let clientToken: string;

  beforeEach(async () => {
    database.reset();

    const fRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: "f.test@vaultlance.io",
        password: "Password123!",
        fullName: "F Dev",
        role: "FREELANCER",
      });
    freelancerToken = fRes.body.data.token;

    const cRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: "c.test@vaultlance.io",
        password: "Password123!",
        fullName: "C Client",
        role: "CLIENT",
      });
    clientToken = cRes.body.data.token;
  });

  it("should create a new vault with initial DRAFT status", async () => {
    const res = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({
        title: "Frontend Development",
        description: "Full Next.js dashboard build",
        amount: 2500,
        currency: "USD",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.amount).toBe(2500);
    expect(res.body.data.currency).toBe("USD");
  });

  it("should reject vault creation with non-positive amount", async () => {
    const res = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({
        title: "Bad Vault",
        amount: -100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should enforce complete invitation and acceptance workflow", async () => {
    // 1. Create vault
    const createRes = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({
        title: "Smart Contract Audit",
        amount: 4000,
      });
    const vaultId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe("DRAFT");

    // 2. Freelancer invites Client -> transitions DRAFT to AWAITING_CLIENT
    const inviteRes = await request(app)
      .post(`/api/vaults/${vaultId}/invite`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ clientEmail: "c.test@vaultlance.io" });

    expect(inviteRes.status).toBe(200);
    expect(inviteRes.body.data.status).toBe("AWAITING_CLIENT");

    // 3. Client accepts -> transitions AWAITING_CLIENT to AWAITING_AUTHORIZATION
    const acceptRes = await request(app)
      .post(`/api/vaults/${vaultId}/accept`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe("AWAITING_AUTHORIZATION");
  });

  it("should reject invalid state transitions according to domain state machine", async () => {
    // 1. Create vault in DRAFT
    const createRes = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({
        title: "Security Review",
        amount: 1500,
      });
    const vaultId = createRes.body.data.id;

    // 2. Attempt illegal transition directly from DRAFT to PAID
    const illegalTransitionRes = await request(app)
      .patch(`/api/vaults/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({
        status: "PAID",
      });

    expect(illegalTransitionRes.status).toBe(409);
    expect(illegalTransitionRes.body.error.code).toBe("INVALID_STATE_TRANSITION");
  });
});
