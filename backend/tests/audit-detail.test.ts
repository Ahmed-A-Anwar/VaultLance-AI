import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";
import { resetAuditUsageForTests } from "../src/audit/usage.js";
import { resetAuditReportsForTests } from "../src/audit/routes.js";
import { recordWaivers } from "../src/audit/waivers.js";
import { manifestMemory } from "../src/vaults/submit.routes.js";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(email: string, role: "FREELANCER" | "CLIENT"): Promise<string> {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Password123!", fullName: email, role });
  return res.body.data.token as string;
}

interface Room {
  id: string;
  freelancer: string;
  client: string;
  checks: Array<{ id: string; name: string; result: string; state: string }>;
}

/* One delivery with no documentation, audited the way the room audits it:
   upload, submit, invite, accept, authorize, run the checks. chk_documents
   fails, so the room has a real failed report to read back. */
async function openRoom(): Promise<Room> {
  const freelancer = await register("f.detail@vaultlance.io", "FREELANCER");
  const client = await register("c.detail@vaultlance.io", "CLIENT");

  const created = await request(app)
    .post("/api/vaults")
    .set(auth(freelancer))
    .send({ title: "Audit detail delivery", amount: 250, description: "Landing page, no docs attached" });
  const id = created.body.data.id as string;

  const upload = await request(app)
    .post(`/api/uploads/${id}`)
    .set(auth(freelancer))
    .attach("file", Buffer.from("a real deliverable"), "delivery.txt");
  expect(upload.status).toBe(201);

  const submitted = await request(app)
    .post(`/api/vaults/${id}/submit`)
    .set(auth(freelancer))
    .send({});
  expect(submitted.status).toBe(200);

  const invited = await request(app)
    .post(`/api/vaults/${id}/invite`)
    .set(auth(freelancer))
    .send({ clientEmail: "c.detail@vaultlance.io" });
  expect(invited.status).toBe(200);

  const accepted = await request(app).post(`/api/vaults/${id}/accept`).set(auth(client));
  expect(accepted.status).toBe(200);

  database.store.vaults.get(id)!.status = "AUTHORIZED";

  const run = await request(app).post(`/api/vaults/${id}/checks/run`).set(auth(client));
  expect(run.status).toBe(200);

  return { id, freelancer, client, checks: run.body.data.checks };
}

const detailOf = (id: string, token: string) =>
  request(app).get(`/api/vaults/${id}/audit-detail`).set(auth(token));

describe("audit detail after the query consolidation", () => {
  beforeEach(() => {
    database.reset();
    manifestMemory.reset();
    resetAuditUsageForTests();
    resetAuditReportsForTests();
  });

  it("serves the same room state the check run and the vault row hold", async () => {
    const { id, client, checks } = await openRoom();

    const res = await detailOf(id, client);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Audit detail loaded");

    const data = res.body.data;
    const row = database.store.vaults.get(id) as any;

    expect(data.vault).toMatchObject({
      id,
      title: "Audit detail delivery",
      amount: 250,
      status: "AWAITING_APPROVAL",
    });

    /* the files and checks are the ones the run used, not re-queried copies */
    expect(data.files).toHaveLength(1);
    expect(data.files[0]).toMatchObject({ name: "delivery.txt", kind: "file" });
    expect(data.checks.map((c: any) => c.id)).toEqual(checks.map((c) => c.id));
    expect(data.checks.map((c: any) => c.result)).toEqual(checks.map((c) => c.result));
    for (const check of data.checks) expect(check.state).toBe(check.result);

    /* the four fields that used to be separate queries come from the same row */
    expect(data.failedChecks).toEqual(row.failed_checks);
    expect(data.failedChecks.map((c: any) => c.id)).toEqual(
      checks.filter((c) => c.result === "fail").map((c) => c.id)
    );
    expect(data.waivedChecks).toEqual(row.waived_checks ?? []);
    expect(data.waivedChecks).toEqual([]);
    expect(data.revisionNote).toBe(row.revision_note ?? null);
    expect(data.revisionNote).toBeNull();
    expect(data.questionsUsed).toBe(Number(row.questions_used) || 0);
    expect(data.questionsUsed).toBe(0);
    expect(data.questionLimit).toBe(15);

    expect(data.messages).toEqual([]);
    expect(data.suggestions).toEqual([
      "What files were delivered?",
      "Are there any issues with the delivery?",
      "Is the build ready to ship?",
    ]);

    /* a second read is the same document: the parallel phase leaves no drift */
    const again = await detailOf(id, client);
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual(data);
  });

  it("reads waivers from the vault row, not from a second lookup", async () => {
    const { id, client, checks } = await openRoom();
    const failed = checks.find((check) => check.result === "fail");
    expect(failed).toBeDefined();

    await recordWaivers(id, [
      {
        checkId: failed!.id,
        name: failed!.name,
        reason: "Documentation follows by email",
        waivedAt: new Date().toISOString(),
        waivedBy: "client",
      },
    ]);

    const res = await detailOf(id, client);
    expect(res.status).toBe(200);

    const row = database.store.vaults.get(id) as any;
    expect(res.body.data.waivedChecks).toEqual(row.waived_checks);
    expect(res.body.data.waivedChecks).toHaveLength(1);
    expect(res.body.data.waivedChecks[0]).toMatchObject({
      checkId: failed!.id,
      name: failed!.name,
      reason: "Documentation follows by email",
    });
  });

  it("keeps the revision note and the question counter on the payload", async () => {
    const { id, client } = await openRoom();

    const revised = await request(app)
      .post(`/api/vaults/${id}/revision`)
      .set(auth(client))
      .send({ note: "Add the missing documentation" });
    expect(revised.status).toBe(200);

    const asked = await request(app)
      .post(`/api/vaults/${id}/chat`)
      .set(auth(client))
      .send({ question: "What files were delivered?" });
    expect(asked.status).toBe(200);

    const res = await detailOf(id, client);
    expect(res.status).toBe(200);

    const row = database.store.vaults.get(id) as any;
    expect(res.body.data.vault.status).toBe("NEEDS_REVISION");
    expect(res.body.data.revisionNote).toBe("Add the missing documentation");
    expect(res.body.data.revisionNote).toBe(row.revision_note);
    expect(res.body.data.questionsUsed).toBe(1);
    expect(res.body.data.questionsUsed).toBe(Number(row.questions_used));

    /* a room sent back for revision shows the checks as queued, not settled */
    expect(res.body.data.checks.length).toBeGreaterThan(0);
    expect(res.body.data.checks.every((check: any) => check.state === "queued")).toBe(true);

    expect(res.body.data.messages).toHaveLength(2);
    expect(res.body.data.messages.map((m: any) => m.role)).toEqual(["user", "ai"]);
  });

  it("emits a Server-Timing header with the vault, reads, checks and total phases", async () => {
    const { id, client } = await openRoom();

    const res = await detailOf(id, client);
    expect(res.status).toBe(200);

    const header = res.headers["server-timing"];
    expect(typeof header).toBe("string");
    expect(header).toMatch(/^vault;dur=\d+, reads;dur=\d+, checks;dur=\d+, total;dur=\d+$/);

    const phases: Record<string, number> = {};
    for (const match of header.matchAll(/([a-z]+);dur=(\d+)/g)) {
      phases[match[1]] = Number(match[2]);
    }

    expect(Object.keys(phases).sort()).toEqual(["checks", "reads", "total", "vault"]);
    for (const value of Object.values(phases)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }

    /* the phases run in sequence, so the total cannot be shorter than any one */
    expect(phases.total).toBeGreaterThanOrEqual(phases.vault);
    expect(phases.total).toBeGreaterThanOrEqual(phases.reads);
    expect(phases.total).toBeGreaterThanOrEqual(phases.checks);
  });
});
