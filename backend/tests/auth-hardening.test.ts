import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";
import { config, resolveSecret } from "../src/shared/config.js";
import { signToken, type TokenPayload } from "../src/auth/jwt.js";
import { sessionStore } from "../src/auth/session.store.js";

/* The literal this repository shipped before batch 1. A token signed with it was
   accepted by the deployed API; it must never be accepted again. */
const OLD_FALLBACK = "vaultlance-secure-jwt-secret-key-change-in-production-32chars!";

const USER_ID = "user-hardening-1";
const SESSION_ID = "session-hardening-1";

const payload = (over: Partial<TokenPayload> = {}): TokenPayload => ({
  userId: USER_ID,
  email: "hardening@example.com",
  role: "CLIENT",
  fullName: "Hardening",
  sessionId: SESSION_ID,
  ...over,
});

function seedUser() {
  database.store.users.set(USER_ID, {
    id: USER_ID,
    email: "hardening@example.com",
    password_hash: "x",
    full_name: "Hardening",
    role: "CLIENT",
    avatar_url: null,
    account_status: "ACTIVE",
    created_at: new Date(),
    updated_at: new Date(),
  });
}

const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

describe("B1 – JWT secret and session forgery", () => {
  beforeEach(() => {
    database.reset();
    seedUser();
  });

  it("rejects a token signed with the old fallback literal", async () => {
    const forged = jwt.sign(payload(), OLD_FALLBACK, { algorithm: "HS256", expiresIn: "1h" });

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects a validly signed token that has no session row", async () => {
    const token = signToken(payload());

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_REVOKED");
    /* and it must not create the row as a side effect */
    expect(await sessionStore.getSession(SESSION_ID)).toBeNull();
  });

  it("rejects a revoked session", async () => {
    const token = signToken(payload());
    await sessionStore.createSession(USER_ID, token, undefined, undefined, SESSION_ID);
    await sessionStore.revokeSession(SESSION_ID);

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_REVOKED");
  });

  it("rejects a rewritten token that reuses another session id", async () => {
    const first = signToken(payload());
    await sessionStore.createSession(USER_ID, first, undefined, undefined, SESSION_ID);
    const second = signToken(payload({ fullName: "Rewritten" }));

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${second}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("logout invalidates the token", async () => {
    const reg = await request(app).post("/api/auth/register").send({
      email: "logout-hardening@example.com",
      password: "StrongPassword123!",
      fullName: "Logout Hardening",
      role: "CLIENT",
    });
    expect(reg.status).toBe(201);

    const token = reg.body.data.token;
    await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${token}`);

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("SESSION_REVOKED");
  });

  it("rejects an expired token", async () => {
    const expired = jwt.sign(payload(), config.jwt.secret, { algorithm: "HS256", expiresIn: "-1s" });

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("rejects an unsigned alg=none token", async () => {
    const unsigned = `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload())}.`;

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${unsigned}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("refuses to resolve a missing or short secret in production", () => {
    expect(() => resolveSecret("JWT_SECRET", { NODE_ENV: "production" })).toThrow(/at least 32/);
    expect(() => resolveSecret("JWT_SECRET", { NODE_ENV: "production", JWT_SECRET: "short" })).toThrow(
      /at least 32/
    );
    expect(resolveSecret("JWT_SECRET", { NODE_ENV: "production", JWT_SECRET: "x".repeat(32) })).toHaveLength(32);
  });

  it("generates a different development secret per call instead of using a literal", () => {
    const a = resolveSecret("JWT_SECRET", { NODE_ENV: "development" });
    const b = resolveSecret("JWT_SECRET", { NODE_ENV: "development" });
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
    expect(a).not.toBe(OLD_FALLBACK);
  });
});
