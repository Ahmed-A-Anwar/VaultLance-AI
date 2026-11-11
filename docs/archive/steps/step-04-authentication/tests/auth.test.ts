import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";

describe("Step 4 – Authentication & Password Hashing & Sessions", () => {
  beforeEach(() => {
    database.reset();
  });

  it("should successfully register a new freelancer user with hashed password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "alice.freelancer@vaultlance.io",
        password: "StrongPassword123!",
        fullName: "Alice Dev",
        role: "FREELANCER",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("alice.freelancer@vaultlance.io");
    expect(res.body.data.user.role).toBe("FREELANCER");
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.sessionId).toBeDefined();

    // Verify password is NOT stored in plain text in database
    const savedUser = database.store.users.get(res.body.data.user.id);
    expect(savedUser).toBeDefined();
    expect(savedUser?.password_hash).not.toBe("StrongPassword123!");
    expect(savedUser?.password_hash.startsWith("$2")).toBe(true); // bcrypt prefix
  });

  it("should reject registration with duplicate email", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        email: "duplicate@vaultlance.io",
        password: "StrongPassword123!",
        fullName: "User One",
        role: "FREELANCER",
      });

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "duplicate@vaultlance.io",
        password: "AnotherPassword123!",
        fullName: "User Two",
        role: "CLIENT",
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("should reject registration with invalid password (less than 8 chars)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "short@vaultlance.io",
        password: "short",
        fullName: "Short Pass",
        role: "CLIENT",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should successfully login an existing user with correct credentials", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        email: "bob.client@vaultlance.io",
        password: "ClientPassword123!",
        fullName: "Bob Client",
        role: "CLIENT",
      });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({
        email: "bob.client@vaultlance.io",
        password: "ClientPassword123!",
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.token).toBeDefined();
    expect(loginRes.body.data.user.email).toBe("bob.client@vaultlance.io");
    expect(loginRes.body.data.user.role).toBe("CLIENT");
  });

  it("should reject login with wrong password", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        email: "bob.client@vaultlance.io",
        password: "ClientPassword123!",
        fullName: "Bob Client",
        role: "CLIENT",
      });

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "bob.client@vaultlance.io",
        password: "WrongPassword999!",
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("should access protected route with valid Bearer token", async () => {
    const regRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: "me@vaultlance.io",
        password: "ClientPassword123!",
        fullName: "Me Profile",
        role: "FREELANCER",
      });

    const token = regRes.body.data.token;

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe("me@vaultlance.io");
  });

  it("should reject request when session is revoked upon logout", async () => {
    const regRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: "logout@vaultlance.io",
        password: "ClientPassword123!",
        fullName: "Logout Test",
        role: "FREELANCER",
      });

    const token = regRes.body.data.token;

    // Logout
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);

    // Re-access protected endpoint
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meRes.status).toBe(401);
    expect(meRes.body.error.code).toBe("SESSION_REVOKED");
  });
});
