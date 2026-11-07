import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

const { app } = await import("../src/app.js");
const { database } = await import("../src/shared/db.js");
const store = await import("../src/money/money.store.js");
const { manifestMemory } = await import("../src/vaults/submit.routes.js");
const { resetLimitState } = await import("../src/playground/resetLimit.js");

async function register(email: string, role: "FREELANCER" | "CLIENT"): Promise<string> {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Password123!", fullName: email, role });
  expect(res.status).toBe(201);
  return res.body.data.token as string;
}

async function start() {
  const res = await request(app).post("/api/playground/start").send({});
  expect(res.status).toBe(200);
  return res.body.data as {
    vaultId: string;
    tokens: { freelancer: string; client: string };
    failedChecks: Array<{ id: string; name: string }>;
  };
}

describe("playground reset guards", () => {
  beforeEach(() => {
    database.reset();
    store.memory.reset();
    manifestMemory.reset();
    resetLimitState.clear();
  });

  it("refuses reset for a normal user", async () => {
    const normal = await register("normal@playground.test", "CLIENT");

    const res = await request(app)
      .post("/api/playground/reset")
      .set("Authorization", `Bearer ${normal}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PLAYGROUND_ONLY");
  });

  it("resets only the playground accounts' data and leaves every other vault alone", async () => {
    const playground = await start();

    const normalSeller = await register("seller@playground.test", "FREELANCER");
    const made = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${normalSeller}`)
      .send({ title: "Customer vault", amount: 90 });
    expect(made.status).toBe(201);
    const customerVault = made.body.data.id as string;

    const reset = await request(app)
      .post("/api/playground/reset")
      .set("Authorization", `Bearer ${playground.tokens.client}`)
      .send({});

    expect(reset.status).toBe(200);
    expect(reset.body.data.vaultId).not.toBe(playground.vaultId);
    expect(database.store.vaults.has(playground.vaultId)).toBe(false);

    const customer = await request(app)
      .get(`/api/vaults/${customerVault}`)
      .set("Authorization", `Bearer ${normalSeller}`);
    expect(customer.status).toBe(200);
    expect(customer.body.data.title).toBe("Customer vault");

    /* reset writes exactly one ledger line, on the fresh baseline */
    const resetRows = store.memory.ledger.filter((row) => row.event_type === "PLAYGROUND_RESET");
    expect(resetRows).toHaveLength(1);
    expect(resetRows[0].vault_id).toBe(reset.body.data.vaultId);
  });

  it("does not delete a playground-owned vault that has a non-playground member", async () => {
    const playground = await start();
    const outsider = await register("outsider@playground.test", "CLIENT");

    database.store.members.set("member-outsider", {
      id: "member-outsider",
      vault_id: playground.vaultId,
      user_id: database.store.users.get(
        [...database.store.users.values()].find((u) => u.email === "outsider@playground.test")!.id
      )!.id,
      role: "CLIENT",
      invitation_status: "ACCEPTED",
      joined_at: new Date(),
      created_at: new Date(),
    });

    const reset = await request(app)
      .post("/api/playground/reset")
      .set("Authorization", `Bearer ${playground.tokens.freelancer}`)
      .send({});

    expect(reset.status).toBe(200);
    expect(database.store.vaults.has(playground.vaultId)).toBe(true);
    const old = await request(app)
      .get(`/api/vaults/${playground.vaultId}`)
      .set("Authorization", `Bearer ${playground.tokens.freelancer}`);
    expect(old.status).toBe(200);
    void outsider;
  });

  it("limits resets to three an hour per IP", async () => {
    const playground = await start();

    for (let i = 0; i < 3; i++) {
      const ok = await request(app)
        .post("/api/playground/reset")
        .set("Authorization", `Bearer ${playground.tokens.freelancer}`)
        .send({});
      expect(ok.status).toBe(200);
    }

    const blocked = await request(app)
      .post("/api/playground/reset")
      .set("Authorization", `Bearer ${playground.tokens.freelancer}`)
      .send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("PLAYGROUND_RESET_LIMIT");
  });

  it("runs the deterministic checks on the uncomplete sample", async () => {
    const playground = await start();

    const loaded = await request(app)
      .post("/api/playground/sample")
      .set("Authorization", `Bearer ${playground.tokens.freelancer}`)
      .send({ kind: "incomplete" });

    expect(loaded.status).toBe(200);
    expect(loaded.body.data.failedChecks.length).toBeGreaterThan(0);
    expect(loaded.body.data.checks.some((check: any) => check.id === "chk_docs" && check.result === "fail")).toBe(true);

    const complete = await request(app)
      .post("/api/playground/sample")
      .set("Authorization", `Bearer ${playground.tokens.freelancer}`)
      .send({ kind: "complete" });
    expect(complete.status).toBe(200);
    expect(complete.body.data.failedChecks).toHaveLength(0);
    expect(complete.body.data.checks.every((check: any) => check.result !== "fail")).toBe(true);
  });
});
