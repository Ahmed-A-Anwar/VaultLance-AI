import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";
import { inviteMemory } from "../src/vaults/invite.store.js";

describe("invite codes — mint and join", () => {
  let freelancerToken: string;
  let clientToken: string;

  beforeEach(async () => {
    database.reset();
    inviteMemory.reset();

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

  it("joins by code alone and moves the vault to AWAITING_AUTHORIZATION", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);

    const join = await request(app)
      .post("/api/vaults/join")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ code: code.toLowerCase() });

    expect(join.status).toBe(200);
    expect(join.body.data).toMatchObject({ vaultId, joined: true, status: "AWAITING_AUTHORIZATION" });

    /* the client is now a member and can read the vault */
    const read = await request(app)
      .get(`/api/vaults/${vaultId}`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(read.status).toBe(200);
  });

  it("answers the same 404 for a spent code", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);

    const first = await request(app)
      .post("/api/vaults/join")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ code });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/vaults/join")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ code });
    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe("INVITE_INVALID");
  });

  it("answers the same 404 for a wrong shape and a wrong code", async () => {
    const short = await request(app)
      .post("/api/vaults/join")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ code: "NOPE" });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe("INVITE_INVALID");

    const unknown = await request(app)
      .post("/api/vaults/join")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ code: "VL-0000-0000" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("INVITE_INVALID");
  });

  it("refuses an expired code", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);
    inviteMemory.invites.get(code)!.expiresAt = new Date(Date.now() - 1_000);

    const res = await request(app)
      .post("/api/vaults/join")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ code });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INVITE_INVALID");
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

  it("refuses the join to a freelancer", async () => {
    const vaultId = await createVault();
    const code = await mint(vaultId);

    const res = await request(app)
      .post("/api/vaults/join")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ code });
    expect(res.status).toBe(403);
  });
});
