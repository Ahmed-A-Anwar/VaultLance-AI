import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The Supabase client is replaced with a tiny in-memory table that applies the
 * same filters the store uses. That lets the test make two SessionStore
 * instances — the equivalent of the two Fly machines — and prove a session made
 * by one is read, revoked and expired by the other.
 */
vi.mock("../src/shared/supabaseClient.js", () => {
  const tables = new Map<string, any[]>();
  let live = true;
  let failNext = false;

  const rowsOf = (name: string) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };

  class Query {
    private filters: Array<(row: any) => boolean> = [];

    constructor(
      private name: string,
      private action: "select" | "update" | "delete",
      private patch: Record<string, any> = {}
    ) {}

    eq(col: string, val: any) {
      this.filters.push((row) => row[col] === val);
      return this;
    }

    neq(col: string, val: any) {
      this.filters.push((row) => row[col] !== val);
      return this;
    }

    lt(col: string, val: any) {
      this.filters.push((row) => row[col] < val);
      return this;
    }

    select(_cols?: string) {
      return this;
    }

    private matched() {
      return rowsOf(this.name).filter((row) => this.filters.every((f) => f(row)));
    }

    async execute(): Promise<{ data: any; error: any }> {
      if (failNext) {
        failNext = false;
        return { data: null, error: { message: "simulated outage" } };
      }

      if (this.action === "select") {
        return { data: this.matched().map((row) => ({ ...row })), error: null };
      }

      if (this.action === "update") {
        const hit = this.matched();
        for (const row of hit) Object.assign(row, this.patch);
        return { data: hit.map((row) => ({ id: row.id })), error: null };
      }

      const hit = new Set(this.matched());
      tables.set(
        this.name,
        rowsOf(this.name).filter((row) => !hit.has(row))
      );
      return { data: [...hit].map((row) => ({ id: row.id })), error: null };
    }

    async maybeSingle() {
      const { data, error } = await this.execute();
      return { data: data ? ((data as any[])[0] ?? null) : null, error };
    }

    /* awaiting the builder itself (update/delete) runs the operation */
    then(resolve: any, reject: any) {
      return this.execute().then(resolve, reject);
    }
  }

  class Table {
    constructor(private name: string) {}

    select(_cols?: string) {
      return new Query(this.name, "select");
    }

    update(patch: Record<string, any>) {
      return new Query(this.name, "update", patch);
    }

    delete() {
      return new Query(this.name, "delete");
    }

    async insert(rows: any[]) {
      if (failNext) {
        failNext = false;
        return { error: { message: "simulated outage" } };
      }
      rowsOf(this.name).push(...rows.map((row) => ({ ...row })));
      return { error: null };
    }
  }

  return {
    supabase: { from: (name: string) => new Table(name) },
    isSupabaseConfigured: () => live,
    __test: {
      reset() {
        tables.clear();
        live = true;
        failNext = false;
      },
      setLive(value: boolean) {
        live = value;
      },
      failNext() {
        failNext = true;
      },
      rows(name: string) {
        return rowsOf(name);
      },
    },
  };
});

import * as supabaseModule from "../src/shared/supabaseClient.js";
import { SessionStore } from "../src/auth/session.store.js";
import { database } from "../src/shared/db.js";

const fake = (supabaseModule as any).__test as {
  reset(): void;
  setLive(value: boolean): void;
  failNext(): void;
  rows(name: string): any[];
};

describe("durable auth sessions", () => {
  beforeEach(() => {
    fake.reset();
    database.reset();
  });

  it("reads a session created by another store instance", async () => {
    const machineA = new SessionStore();
    const machineB = new SessionStore();

    await machineA.createSession("user-1", "token-1", "1.2.3.4", "vitest", "session-1");

    const seen = await machineB.getSession("session-1");
    expect(seen).not.toBeNull();
    expect(seen?.userId).toBe("user-1");
    expect(seen?.token).toBe("token-1");
    expect(seen?.ipAddress).toBe("1.2.3.4");
    expect(seen?.userAgent).toBe("vitest");
    expect(seen?.revoked).toBe(false);
    expect(fake.rows("auth_sessions")).toHaveLength(1);
  });

  it("revokes on one instance and the other sees the session end", async () => {
    const machineA = new SessionStore();
    const machineB = new SessionStore();

    await machineA.createSession("user-1", "token-1", undefined, undefined, "session-1");

    await expect(machineB.revokeSession("session-1")).resolves.toBe(true);
    await expect(machineA.getSession("session-1")).resolves.toBeNull();
    await expect(machineB.revokeSession("session-missing")).resolves.toBe(false);
  });

  it("treats an expired row as no session", async () => {
    const machineA = new SessionStore();
    const machineB = new SessionStore();

    await machineA.createSession("user-1", "token-1", undefined, undefined, "session-1");
    fake.rows("auth_sessions")[0].expires_at = new Date(Date.now() - 60_000).toISOString();

    await expect(machineB.getSession("session-1")).resolves.toBeNull();
  });

  it("revokes every other session for the user and keeps the current one", async () => {
    const machineA = new SessionStore();
    const machineB = new SessionStore();

    await machineA.createSession("user-1", "token-1", undefined, undefined, "keep");
    await machineA.createSession("user-1", "token-2", undefined, undefined, "other-1");
    await machineA.createSession("user-1", "token-3", undefined, undefined, "other-2");
    await machineA.createSession("user-2", "token-4", undefined, undefined, "someone-else");

    await expect(machineB.revokeAllExcept("user-1", "keep")).resolves.toBe(2);

    expect(await machineA.getSession("keep")).not.toBeNull();
    expect(await machineA.getSession("other-1")).toBeNull();
    expect(await machineA.getSession("other-2")).toBeNull();
    expect(await machineA.getSession("someone-else")).not.toBeNull();
  });

  it("revokes every session for a user", async () => {
    const machineA = new SessionStore();
    const machineB = new SessionStore();

    await machineA.createSession("user-1", "token-1", undefined, undefined, "session-1");
    await machineA.createSession("user-1", "token-2", undefined, undefined, "session-2");
    await machineA.createSession("user-2", "token-3", undefined, undefined, "session-3");

    await machineB.revokeAllForUser("user-1");

    expect(await machineA.getSession("session-1")).toBeNull();
    expect(await machineA.getSession("session-2")).toBeNull();
    expect(await machineA.getSession("session-3")).not.toBeNull();
  });

  it("prunes expired and revoked rows but keeps live ones", async () => {
    const machineA = new SessionStore();

    await machineA.createSession("user-1", "token-1", undefined, undefined, "expired");
    await machineA.createSession("user-1", "token-2", undefined, undefined, "revoked");
    await machineA.createSession("user-1", "token-3", undefined, undefined, "live");

    fake.rows("auth_sessions").find((row) => row.id === "expired")!.expires_at =
      new Date(Date.now() - 60_000).toISOString();
    fake.rows("auth_sessions").find((row) => row.id === "revoked")!.revoked = true;

    await expect(machineA.pruneExpired()).resolves.toBe(2);
    expect(fake.rows("auth_sessions").map((row) => row.id)).toEqual(["live"]);
  });

  it("falls back to the in-memory store when Supabase is not configured", async () => {
    fake.setLive(false);
    const machineA = new SessionStore();
    const machineB = new SessionStore();

    await machineA.createSession("user-1", "token-1", undefined, undefined, "session-1");

    const seen = await machineB.getSession("session-1");
    expect(seen?.userId).toBe("user-1");
    expect(fake.rows("auth_sessions")).toHaveLength(0);
    expect(database.store.sessions.has("session-1")).toBe(true);
  });

  it("surfaces a database failure as an error, not as a revoked session", async () => {
    const machineA = new SessionStore();
    await machineA.createSession("user-1", "token-1", undefined, undefined, "session-1");

    fake.failNext();
    await expect(machineA.getSession("session-1")).rejects.toMatchObject({
      code: "DATABASE_ERROR",
      statusCode: 500,
    });

    fake.failNext();
    await expect(
      machineA.createSession("user-1", "token-2", undefined, undefined, "session-2")
    ).rejects.toMatchObject({ code: "DATABASE_ERROR" });
  });
});
