import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const paypal = vi.hoisted(() => ({
  captureAuthorization: vi.fn(),
  getCapture: vi.fn(),
  createPayout: vi.fn(),
}));
vi.mock("../src/paypal/payments.client.js", () => paypal);

const { app } = await import("../src/app.js");
const { database } = await import("../src/shared/db.js");
const store = await import("../src/money/money.store.js");
const { manifestMemory } = await import("../src/vaults/submit.routes.js");

async function register(email: string, role: "FREELANCER" | "CLIENT"): Promise<string> {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Password123!", fullName: email, role });
  return res.body.data.token as string;
}

type Setup = { id: string; freelancer: string; client: string; failed: Array<{ id: string; name: string }> };

describe("failed checks, waivers and revisions", () => {
  let freelancer: string;
  let client: string;

  beforeEach(async () => {
    database.reset();
    store.memory.reset();
    manifestMemory.reset();
    paypal.captureAuthorization.mockReset();
    paypal.getCapture.mockReset();
    paypal.createPayout.mockReset();
    paypal.captureAuthorization.mockResolvedValue({
      id: "cap-1",
      status: "COMPLETED",
      amountCents: 25000,
      currency: "USD",
      feeCents: 1250,
      netCents: 23750,
    });
    paypal.getCapture.mockResolvedValue({
      id: "cap-1",
      status: "COMPLETED",
      amountCents: 25000,
      currency: "USD",
      feeCents: 1250,
      netCents: 23750,
    });
    paypal.createPayout.mockResolvedValue({ batchId: "batch-1", itemId: "item-1", status: "PENDING" });

    freelancer = await register("f.waiver@vaultlance.io", "FREELANCER");
    client = await register("c.waiver@vaultlance.io", "CLIENT");
  });

  /* one delivery with no documentation, so chk_documents fails and the vault
     settles at AWAITING_APPROVAL the way a real audit leaves it */
  async function setup(): Promise<Setup> {
    const created = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancer}`)
      .send({ title: "Waiver delivery", amount: 250, description: "Landing page, no docs attached" });
    const id = created.body.data.id as string;

    await request(app)
      .post(`/api/uploads/${id}`)
      .set("Authorization", `Bearer ${freelancer}`)
      .attach("file", Buffer.from("a real deliverable"), "delivery.txt");

    /* the delivery is locked while the vault is still a draft, then the client
       is invited to it: submit -> invite is the flow the room supports */
    const submitted = await request(app)
      .post(`/api/vaults/${id}/submit`)
      .set("Authorization", `Bearer ${freelancer}`)
      .send({});
    expect(submitted.status).toBe(200);

    await request(app)
      .post(`/api/vaults/${id}/invite`)
      .set("Authorization", `Bearer ${freelancer}`)
      .send({ clientEmail: "c.waiver@vaultlance.io" });
    const accepted = await request(app)
      .post(`/api/vaults/${id}/accept`)
      .set("Authorization", `Bearer ${client}`);
    expect(accepted.status).toBe(200);

    database.store.vaults.get(id)!.status = "AUTHORIZED";
    await store.rememberAuthorization(id, "auth-1");

    const run = await request(app)
      .post(`/api/vaults/${id}/checks/run`)
      .set("Authorization", `Bearer ${client}`);
    expect(run.status).toBe(200);

    const detail = await request(app)
      .get(`/api/vaults/${id}/audit-detail`)
      .set("Authorization", `Bearer ${client}`);
    expect(detail.status).toBe(200);

    const failed = (detail.body.data.failedChecks || []) as Array<{ id: string; name: string }>;
    expect(failed.length).toBeGreaterThan(0);
    return { id, freelancer, client, failed };
  }

  const vaultOf = async (id: string, token: string) => {
    const res = await request(app).get(`/api/vaults/${id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body.data;
  };

  it("waives only a check the server recorded as failed, and shows it on the paid vault", async () => {
    const { id, failed } = await setup();

    const approved = await request(app)
      .post(`/api/vaults/${id}/approve`)
      .set("Authorization", `Bearer ${client}`)
      .send({ waivers: [{ checkId: failed[0].id, reason: "Documentation follows by email" }] });

    expect(approved.status).toBe(200);

    const paid = await vaultOf(id, client);
    expect(paid.status).toBe("PAID");
    expect(paid.waivedChecks).toHaveLength(1);
    expect(paid.waivedChecks[0].checkId).toBe(failed[0].id);
    expect(paid.waivedChecks[0].reason).toBe("Documentation follows by email");

    /* the freelancer sees the same waiver, and the ledger keeps one row per id */
    const seller = await vaultOf(id, freelancer);
    expect(seller.waivedChecks[0].name).toBe(failed[0].name);

    const waivedRows = store.memory.ledger.filter((row) => row.event_type === "CHECK_WAIVED");
    expect(waivedRows).toHaveLength(1);
    expect(waivedRows[0].metadata.checkId).toBe(failed[0].id);
    expect(waivedRows[0].metadata.reason).toBe("Documentation follows by email");
  });

  it("refuses a waiver for a check that did not fail", async () => {
    const { id } = await setup();
    const detail = await request(app)
      .get(`/api/vaults/${id}/audit-detail`)
      .set("Authorization", `Bearer ${client}`);
    const passing = (detail.body.data.checks as Array<{ id: string; result: string }>).find(
      (check) => check.result !== "fail"
    );
    expect(passing).toBeDefined();

    const res = await request(app)
      .post(`/api/vaults/${id}/approve`)
      .set("Authorization", `Bearer ${client}`)
      .send({ waivers: [{ checkId: passing!.id }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WAIVER_NOT_ALLOWED");

    const vault = await vaultOf(id, client);
    expect(vault.status).toBe("AWAITING_APPROVAL");
    expect(vault.waivedChecks).toHaveLength(0);
    expect(store.memory.ledger.filter((row) => row.event_type === "CHECK_WAIVED")).toHaveLength(0);
  });

  it("blocks approval while a failed check has not been waived", async () => {
    const { id, failed } = await setup();

    await request(app)
      .post(`/api/vaults/${id}/approve`)
      .set("Authorization", `Bearer ${client}`)
      .send({});

    const partial = failed.length > 1
      ? await request(app)
          .post(`/api/vaults/${id}/approve`)
          .set("Authorization", `Bearer ${client}`)
          .send({ waivers: [{ checkId: failed[0].id }] })
      : null;

    if (partial) expect(partial.status).toBe(400);
    expect((await vaultOf(id, client)).status).toBe("AWAITING_APPROVAL");
  });

  it("moves to NEEDS_REVISION only from AWAITING_APPROVAL, and only for the client", async () => {
    const { id } = await setup();

    const seller = await request(app)
      .post(`/api/vaults/${id}/revision`)
      .set("Authorization", `Bearer ${freelancer}`)
      .send({ note: "I will redo it" });
    expect(seller.status).toBe(403);

    const requested = await request(app)
      .post(`/api/vaults/${id}/revision`)
      .set("Authorization", `Bearer ${client}`)
      .send({ note: "Add the missing documentation" });
    expect(requested.status).toBe(200);

    const revised = await vaultOf(id, client);
    expect(revised.status).toBe("NEEDS_REVISION");
    expect(revised.revisionNote).toBe("Add the missing documentation");

    const again = await request(app)
      .post(`/api/vaults/${id}/revision`)
      .set("Authorization", `Bearer ${client}`)
      .send({});
    expect(again.status).toBe(409);
  });

  it("resubmits as manifest version 2 and re-runs the checks", async () => {
    const { id } = await setup();

    await request(app)
      .post(`/api/vaults/${id}/revision`)
      .set("Authorization", `Bearer ${client}`)
      .send({ note: "Ship docs" });
    expect((await vaultOf(id, client)).status).toBe("NEEDS_REVISION");

    await request(app)
      .post(`/api/uploads/${id}`)
      .set("Authorization", `Bearer ${freelancer}`)
      .attach("file", Buffer.from("documentation for the delivery"), "readme.md");

    const resubmitted = await request(app)
      .post(`/api/vaults/${id}/submit`)
      .set("Authorization", `Bearer ${freelancer}`)
      .send({});

    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.data.version).toBe(2);
    expect(manifestMemory.manifests.get(id)!.version).toBe(2);

    /* the existing edges carry it back to the client, with a fresh report */
    expect((await vaultOf(id, client)).status).toBe("AWAITING_APPROVAL");
    const detail = await request(app)
      .get(`/api/vaults/${id}/audit-detail`)
      .set("Authorization", `Bearer ${client}`);
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.data.checks)).toBe(true);

    const ledger = store.memory.ledger.filter((row) => row.event_type === "AUDIT_COMPLETED");
    expect(ledger.some((row) => row.metadata.version === 2)).toBe(true);
  });
});
