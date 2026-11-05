import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";

async function register(email: string, role: "FREELANCER" | "CLIENT"): Promise<string> {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Password123!", fullName: email, role });
  return res.body.data.token as string;
}

describe("audit re-run", () => {
  let freelancer: string;
  let client: string;

  beforeEach(async () => {
    database.reset();
    freelancer = await register("f.rerun@vaultlance.io", "FREELANCER");
    client = await register("c.rerun@vaultlance.io", "CLIENT");
  });

  async function authorizedVault(title: string): Promise<string> {
    const created = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancer}`)
      .send({ title, amount: 250 });
    const id = created.body.data.id as string;

    await request(app)
      .post(`/api/vaults/${id}/invite`)
      .set("Authorization", `Bearer ${freelancer}`)
      .send({ clientEmail: "c.rerun@vaultlance.io" });

    await request(app).post(`/api/vaults/${id}/accept`).set("Authorization", `Bearer ${client}`);

    // The in-memory /authorize route answers with a null body, so seed the held
    // state directly: this test is about the audit, not about PayPal.
    database.store.vaults.get(id)!.status = "AUTHORIZED";

    return id;
  }

  it("re-runs the audit at AWAITING_APPROVAL without moving the vault", async () => {
    const id = await authorizedVault("Re-runnable audit");

    const first = await request(app)
      .post(`/api/vaults/${id}/checks/run`)
      .set("Authorization", `Bearer ${client}`);
    expect(first.status).toBe(200);
    expect(first.body.data.checks.length).toBeGreaterThan(0);

    const before = await request(app).get(`/api/vaults/${id}`).set("Authorization", `Bearer ${client}`);
    expect(before.body.data.status).toBe("AWAITING_APPROVAL");

    const second = await request(app)
      .post(`/api/vaults/${id}/checks/run`)
      .set("Authorization", `Bearer ${client}`);
    expect(second.status).toBe(200);

    const after = await request(app).get(`/api/vaults/${id}`).set("Authorization", `Bearer ${client}`);
    expect(after.body.data.status).toBe("AWAITING_APPROVAL");
  });

  it("still refuses an audit before the funds are authorized", async () => {
    const created = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancer}`)
      .send({ title: "Too early to audit", amount: 250 });
    const id = created.body.data.id as string;

    const res = await request(app)
      .post(`/api/vaults/${id}/checks/run`)
      .set("Authorization", `Bearer ${freelancer}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_STATE");
  });
});
