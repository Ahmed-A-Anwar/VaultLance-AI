import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";
import { resolveRole } from "../src/auth/auth.service.js";

/* The bug these cover: an account promoted to FREELANCER kept the CLIENT role
   its token was minted with, so "New vault" answered 403 for a freelancer. */
describe("the role a session runs as", () => {
  beforeEach(() => {
    database.reset();
  });

  it("uses the profile role when the account was promoted after sign-in", () => {
    expect(resolveRole("FREELANCER", "CLIENT")).toBe("FREELANCER");
  });

  it("accepts a lower-case or padded role from the profile", () => {
    expect(resolveRole("freelancer", "CLIENT")).toBe("FREELANCER");
    expect(resolveRole(" client ", "FREELANCER")).toBe("CLIENT");
  });

  it("does not keep a role the profile has taken away", () => {
    expect(resolveRole("CLIENT", "FREELANCER")).toBe("CLIENT");
  });

  it("keeps the session's role when the profile has none to give", () => {
    expect(resolveRole(null, "FREELANCER")).toBe("FREELANCER");
    expect(resolveRole(undefined, "CLIENT")).toBe("CLIENT");
    expect(resolveRole("", "FREELANCER")).toBe("FREELANCER");
    expect(resolveRole("OWNER", "CLIENT")).toBe("CLIENT");
  });

  it("lets a stored promotion through a freelancer-only route without a new token", async () => {
    const reg = await request(app).post("/api/auth/register").send({
      email: "promoted@vaultlance.io",
      password: "StrongPassword123!",
      fullName: "Promoted Client",
      role: "CLIENT",
    });
    expect(reg.status).toBe(201);

    const token = reg.body.data.token as string;
    const auth = { Authorization: `Bearer ${token}` };
    const body = { title: "Promoted later", amount: 10, currency: "USD" };

    const before = await request(app).post("/api/vaults").set(auth).send(body);
    expect(before.status).toBe(403);

    const stored = database.store.users.get(reg.body.data.user.id as string)!;
    stored.role = "FREELANCER";

    const after = await request(app).post("/api/vaults").set(auth).send(body);
    expect(after.status).toBe(201);
  });
});
