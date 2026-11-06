import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";
import { inviteMemory } from "../src/vaults/invite.store.js";
import { resetJoinLimits } from "../src/vaults/joinRateLimit.js";

describe("invite codes — mint and join", () => {
  let freelancerToken: string;
  let clientToken: string;

  beforeEach(async () => {
    database.reset();
    inviteMemory.reset();
    resetJoinLimits();

    const fRes = await request(app).post("/api/auth/register").send({
      email: "f.invite@vaultlance.io",
      password: "Password123!",
      fullName: "F Dev",
      role: "FREELANCER",
    });
    freelancerToken = fRes.body.data.token;

    const cRes = await request(app).post("/api/auth/register").send({
      email: "c.invite@vaultlance.io",
      password: "Password123!",
      fullName: "C Client",
      role: "CLIENT",
    });
    clientToken = cRes.body.data.token;
  });

  async function createVault(): Promise<string> {
    const res = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ title: "Invite flow", amount: 420 });
    expect(res.status).toBe(201);
    return res.body.data.id;
  }

  async function mint(vaultId: string): Promise<string> {
    const res = await request(app)
      .post(`/api/vaults/${vaultId}/invite-code`)
      .set("Authorization", `Bearer ${freelancerToken}`);
    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^VL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    return res.body.data.code as string;
  }

  async function registerClient(email: string): Promise<string> {
    const res = await request(app).post("/api/auth/register").send({
      email,
      password: "Password123!",
      fullName: "Second Client",
      role: "CLIENT",
    });
    return res.body.data.token;
  }

  const join = (token: string, code: string) =>
    request(app).post("/api/vaults/join").set("Authorization", `Bearer ${token}`).send({ code });

  it("mints a seven-day code for the freelancer who owns the vault", async () => {
    const vaultId = await createVault();
    const res = await request(app)
      .post(`/api/vaults/${vaultId}/invite-code`)
      .set("Authorization", `Bearer ${freelancerToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.vaultId).toBe(vaultId);
    const days = (new Date(res.body.data.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("refuses to mint for a client", async () => {
    const vaultId = await createVault();
    const res = await request(app)
      .post(`/api/vaults/${vaultId}/invite-code`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it("joins by code alone, answering only the vault id", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);

    /* typed without dashes, lower case */
    const res = await join(clientToken, code.replace(/-/g, "").toLowerCase());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ vaultId });

    const read = await request(app)
      .get(`/api/vaults/${vaultId}`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.status).toBe("AWAITING_AUTHORIZATION");
  });

  it("treats the same client's retry as idempotent success", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);

    const first = await join(clientToken, code);
    const second = await join(clientToken, code);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({ vaultId });
  });

  it("gives a different client the same 404 as every other failure", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);
    await join(clientToken, code);

    const otherToken = await registerClient("c2.invite@vaultlance.io");
    const used = await join(otherToken, code);
    const wrong = await join(otherToken, "VL-0000-0000");
    const malformed = await join(otherToken, "NOPE");

    expect(used.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(used.body).toEqual(wrong.body);
    expect(used.body).toEqual(malformed.body);
    expect(used.body.error.code).toBe("INVITE_INVALID");
  });

  it("refuses an expired code with the same generic answer", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);
    inviteMemory.invites.get(code)!.expiresAt = new Date(Date.now() - 1_000);

    const res = await join(clientToken, code);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INVITE_INVALID");
  });

  it("lets exactly one of two clients win a concurrent redeem", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);
    const otherToken = await registerClient("c3.invite@vaultlance.io");

    const [a, b] = await Promise.all([join(clientToken, code), join(otherToken, code)]);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
  });

  it("stops a guessing loop after ten failures with 429 and Retry-After", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const res = await join(clientToken, "VL-0000-0000");
      statuses.push(res.status);
    }
    const blocked = await join(clientToken, "VL-0000-0000");

    expect(statuses).toEqual(Array(10).fill(404));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    const retryAfter = Number(blocked.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  });

  it("refuses the join to a freelancer", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);

    const res = await join(freelancerToken, code);
    expect(res.status).toBe(403);
  });

  it("keeps the id-scoped join working for the checked script", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);

    const res = await request(app)
      .post(`/api/vaults/${vaultId}/join`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ code });
    expect(res.status).toBe(200);
    expect(res.body.data.joined).toBe(true);
  });
});
