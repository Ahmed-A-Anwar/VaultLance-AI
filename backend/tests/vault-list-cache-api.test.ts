import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

const { app } = await import("../src/app.js");
const { database } = await import("../src/shared/db.js");
const store = await import("../src/money/money.store.js");
const { invalidateVaultListCache } = await import("../src/vaults/vault-list.cache.js");

async function register(email: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Password123!", fullName: email, role: "FREELANCER" });
  expect(res.status).toBe(201);
  return res.body.data.token as string;
}

describe("vault-list cache through the API", () => {
  beforeEach(() => {
    database.reset();
    store.memory.reset();
    invalidateVaultListCache();
  });

  it("serves a repeated list from cache and clears it after a vault write", async () => {
    const token = await register("cache-api@example.com");
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app)
      .post("/api/vaults")
      .set(auth)
      .send({ title: "First delivery", amount: 25, currency: "USD" });
    expect(created.status).toBe(201);

    const first = await request(app).get("/api/vaults").set(auth);
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(1);

    const cached = await request(app).get("/api/vaults").set(auth);
    expect(cached.status).toBe(200);
    expect(cached.body.data).toHaveLength(1);
    expect(cached.headers["server-timing"]).toContain('desc="cache"');

    const second = await request(app)
      .post("/api/vaults")
      .set(auth)
      .send({ title: "Second delivery", amount: 40, currency: "USD" });
    expect(second.status).toBe(201);

    const afterWrite = await request(app).get("/api/vaults").set(auth);
    expect(afterWrite.status).toBe(200);
    expect(afterWrite.body.data).toHaveLength(2);
    expect(afterWrite.headers["server-timing"]).not.toContain('desc="cache"');
  });
});
