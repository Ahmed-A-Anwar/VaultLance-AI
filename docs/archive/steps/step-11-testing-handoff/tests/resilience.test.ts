import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";

describe("Step 11 – Resilience, Duplicate Requests & Database Failure Tests", () => {
  beforeEach(() => {
    database.reset();
  });

  afterEach(() => {
    database.setSimulateFailure(false);
  });

  describe("Duplicate Request Protection", () => {
    it("should prevent duplicate client invitations to the same vault", async () => {
      // Register Freelancer
      const fRes = await request(app)
        .post("/api/auth/register")
        .send({
          email: "freelancer.dup@vaultlance.io",
          password: "Password123!",
          fullName: "Freelancer Dup",
          role: "FREELANCER",
        });

      // Register Client
      await request(app)
        .post("/api/auth/register")
        .send({
          email: "client.dup@vaultlance.io",
          password: "Password123!",
          fullName: "Client Dup",
          role: "CLIENT",
        });

      // Create Vault
      const vRes = await request(app)
        .post("/api/vaults")
        .set("Authorization", `Bearer ${fRes.body.data.token}`)
        .send({ title: "Duplicate Test Vault", amount: 1000 });
      const vaultId = vRes.body.data.id;

      // First invite -> succeeds
      const invite1 = await request(app)
        .post(`/api/vaults/${vaultId}/invite`)
        .set("Authorization", `Bearer ${fRes.body.data.token}`)
        .send({ clientEmail: "client.dup@vaultlance.io" });
      expect(invite1.status).toBe(200);

      // Duplicate invite -> returns 409 Conflict
      const invite2 = await request(app)
        .post(`/api/vaults/${vaultId}/invite`)
        .set("Authorization", `Bearer ${fRes.body.data.token}`)
        .send({ clientEmail: "client.dup@vaultlance.io" });
      expect(invite2.status).toBe(409);
      expect(invite2.body.error.code).toBe("INVITATION_ALREADY_EXISTS");
    });

    it("should prevent duplicate acceptance of an invitation", async () => {
      const fRes = await request(app)
        .post("/api/auth/register")
        .send({
          email: "f.dup2@vaultlance.io",
          password: "Password123!",
          fullName: "Freelancer Two",
          role: "FREELANCER",
        });

      const cRes = await request(app)
        .post("/api/auth/register")
        .send({
          email: "c.dup2@vaultlance.io",
          password: "Password123!",
          fullName: "Client Two",
          role: "CLIENT",
        });

      const vRes = await request(app)
        .post("/api/vaults")
        .set("Authorization", `Bearer ${fRes.body.data.token}`)
        .send({ title: "Dup Accept Vault", amount: 1200 });
      const vaultId = vRes.body.data.id;

      await request(app)
        .post(`/api/vaults/${vaultId}/invite`)
        .set("Authorization", `Bearer ${fRes.body.data.token}`)
        .send({ clientEmail: "c.dup2@vaultlance.io" });

      // First accept -> 200
      const accept1 = await request(app)
        .post(`/api/vaults/${vaultId}/accept`)
        .set("Authorization", `Bearer ${cRes.body.data.token}`);
      expect(accept1.status).toBe(200);

      // Duplicate accept -> 409 Conflict
      const accept2 = await request(app)
        .post(`/api/vaults/${vaultId}/accept`)
        .set("Authorization", `Bearer ${cRes.body.data.token}`);
      expect(accept2.status).toBe(409);
      expect(accept2.body.error.code).toBe("ALREADY_ACCEPTED");
    });
  });

  describe("Database Failure Simulation", () => {
    it("should gracefully handle database failure during registration with 500 status", async () => {
      // Simulate database connection failure
      database.setSimulateFailure(true);

      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: "dbfail@vaultlance.io",
          password: "Password123!",
          fullName: "DB Fail Test",
          role: "FREELANCER",
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("DATABASE_ERROR");
      expect(res.body.message).toContain("Simulated database failure");
    });

    it("should gracefully handle database failure during vault queries", async () => {
      // 1. Register user while healthy
      const regRes = await request(app)
        .post("/api/auth/register")
        .send({
          email: "dbfail.vault@vaultlance.io",
          password: "Password123!",
          fullName: "DB Vault User",
          role: "FREELANCER",
        });
      const token = regRes.body.data.token;

      // 2. Trigger database failure
      database.setSimulateFailure(true);

      // 3. Query vaults
      const listRes = await request(app)
        .get("/api/vaults")
        .set("Authorization", `Bearer ${token}`);

      expect(listRes.status).toBe(500);
      expect(listRes.body.success).toBe(false);
      expect(listRes.body.error.code).toBe("DATABASE_ERROR");
    });
  });
});
