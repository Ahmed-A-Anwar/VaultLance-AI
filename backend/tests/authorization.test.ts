import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";

describe("Step 5 – Role-Based Authorization & Tenant Data Isolation", () => {
  let freelancerToken: string;
  let freelancerId: string;
  let clientToken: string;
  let clientId: string;
  let otherFreelancerToken: string;
  let otherFreelancerId: string;
  let testVaultId: string;

  beforeEach(async () => {
    database.reset();

    // 1. Register Freelancer A
    const res1 = await request(app)
      .post("/api/auth/register")
      .send({
        email: "freelancer.a@vaultlance.io",
        password: "Password123!",
        fullName: "Freelancer A",
        role: "FREELANCER",
      });
    freelancerToken = res1.body.data.token;
    freelancerId = res1.body.data.user.id;

    // 2. Register Client B
    const res2 = await request(app)
      .post("/api/auth/register")
      .send({
        email: "client.b@vaultlance.io",
        password: "Password123!",
        fullName: "Client B",
        role: "CLIENT",
      });
    clientToken = res2.body.data.token;
    clientId = res2.body.data.user.id;

    // 3. Register Unrelated Freelancer C
    const res3 = await request(app)
      .post("/api/auth/register")
      .send({
        email: "freelancer.c@vaultlance.io",
        password: "Password123!",
        fullName: "Freelancer C",
        role: "FREELANCER",
      });
    otherFreelancerToken = res3.body.data.token;
    otherFreelancerId = res3.body.data.user.id;

    // Create a vault owned by Freelancer A
    const vaultRes = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({
        title: "Mobile App Redesign",
        description: "Figma and React Native redesign",
        amount: 3500,
        currency: "USD",
      });
    testVaultId = vaultRes.body.data.id;
  });

  it("should allow FREELANCER to create a vault and reject CLIENT from creating a vault", async () => {
    // Client attempts to create vault -> 403 Forbidden
    const clientAttempt = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        title: "Client Trying to Create Vault",
        amount: 2000,
      });

    expect(clientAttempt.status).toBe(403);
    expect(clientAttempt.body.error.code).toBe("INSUFFICIENT_ROLE_PERMISSIONS");
  });

  it("should prevent unauthorized user from viewing another user's vault (Cross-tenant data isolation)", async () => {
    // Freelancer C (unrelated third party) tries to GET Freelancer A's vault -> 403
    const trespassRes = await request(app)
      .get(`/api/vaults/${testVaultId}`)
      .set("Authorization", `Bearer ${otherFreelancerToken}`);

    expect(trespassRes.status).toBe(403);
    expect(trespassRes.body.error.code).toBe("CROSS_TENANT_ACCESS_DENIED");
  });

  it("should prevent unauthorized user from updating another user's vault", async () => {
    // Freelancer C tries to PATCH Freelancer A's vault -> 403
    const patchRes = await request(app)
      .patch(`/api/vaults/${testVaultId}`)
      .set("Authorization", `Bearer ${otherFreelancerToken}`)
      .send({
        title: "Hacked Title",
        amount: 999999,
      });

    expect(patchRes.status).toBe(403);
    expect(["OWNERSHIP_REQUIRED", "CROSS_TENANT_ACCESS_DENIED"]).toContain(patchRes.body.error.code);
  });

  it("should allow invited client to view vault once invited", async () => {
    // 1. Owner invites Client B
    const inviteRes = await request(app)
      .post(`/api/vaults/${testVaultId}/invite`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ clientEmail: "client.b@vaultlance.io" });

    expect(inviteRes.status).toBe(200);

    // 2. Client B can now access vault
    const clientAccessRes = await request(app)
      .get(`/api/vaults/${testVaultId}`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(clientAccessRes.status).toBe(200);
    expect(clientAccessRes.body.data.id).toBe(testVaultId);
  });
});
