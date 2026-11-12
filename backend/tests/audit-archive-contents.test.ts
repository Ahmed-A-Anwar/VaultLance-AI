import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import AdmZip from "adm-zip";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";
import { __resetAiProviderForTests } from "../src/ai/provider.js";
import { resetAuditUsageForTests } from "../src/audit/usage.js";
import { resetAuditReportsForTests } from "../src/audit/routes.js";

async function register(email: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Password123!", fullName: email, role: "FREELANCER" });
  return res.body.data.token as string;
}

async function makeVault(token: string): Promise<string> {
  const created = await request(app)
    .post("/api/vaults")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Archive delivery", description: "One zip", amount: 250 });
  const id = created.body.data.id as string;
  database.store.vaults.get(id)!.status = "AUTHORIZED";
  return id;
}

const junit = (failures: number) =>
  [
    `<testsuite name="release" tests="6" failures="${failures}" errors="0" skipped="0">`,
    ...Array.from({ length: 6 - failures }, (_, i) => `<testcase name="pass-${i}"/>`),
    ...Array.from({ length: failures }, (_, i) => `<testcase name="fail-${i}"><failure message="boom"/></testcase>`),
    "</testsuite>",
  ].join("\n");

function archive(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, body] of Object.entries(files)) zip.addFile(name, Buffer.from(body));
  return zip.toBuffer();
}

async function uploadAndRun(token: string, vaultId: string, zip: Buffer) {
  const upload = await request(app)
    .post(`/api/uploads/${vaultId}`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", zip, "corner-bean.zip");
  expect(upload.status).toBe(201);

  const run = await request(app)
    .post(`/api/vaults/${vaultId}/checks/run`)
    .set("Authorization", `Bearer ${token}`);
  expect(run.status).toBe(200);
  return run.body.data.checks as Array<{ id: string; detail: string; result: string; rows: Array<{ label: string; value: string }> }>;
}

describe("the content checks read inside a delivered archive", () => {
  beforeEach(async () => {
    database.reset();
    resetAuditUsageForTests();
    resetAuditReportsForTests();
    __resetAiProviderForTests();
    process.env.AZURE_OPENAI_KEY = "";
    process.env.GROQ_API_KEY = "";
    process.env.GEMINI_API_KEY = "";
  });

  it("passes Documentation and Test log on one zip that carries both", async () => {
    const token = await register("f.archive@vaultlance.io");
    const id = await makeVault(token);
    const zip = archive({
      "site/index.html": "<h1>Corner Bean</h1>",
      "site/README.md": "# Corner Bean\n\nRun npm start.",
      "site/test-log.txt": junit(0),
    });

    const checks = await uploadAndRun(token, id, zip);

    const docs = checks.find((c) => c.id === "chk_docs")!;
    expect(docs.result).toBe("pass");
    expect(docs.rows[0].value).toContain("corner-bean.zip: site/README.md");

    const tests = checks.find((c) => c.id === "chk_tests")!;
    expect(tests.result).toBe("pass");
    expect(tests.detail).toBe("6 passed · 0 failed · 0 skipped");
    expect(tests.rows.find((r) => r.label === "source")?.value).toContain("test-log.txt");
  });

  it("counts one README once when it is delivered and also inside the archive", async () => {
    const token = await register("f.both@vaultlance.io");
    const id = await makeVault(token);
    const zip = archive({ "site/README.md": "# Corner Bean", "site/test-log.txt": junit(0) });

    const doc = await request(app)
      .post(`/api/uploads/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("# Corner Bean\n\nRun npm start."), "README.md");
    expect(doc.status).toBe(201);
    const log = await request(app)
      .post(`/api/uploads/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(junit(0)), "test-log.txt");
    expect(log.status).toBe(201);
    const upload = await request(app)
      .post(`/api/uploads/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", zip, "corner-bean.zip");
    expect(upload.status).toBe(201);

    const run = await request(app)
      .post(`/api/vaults/${id}/checks/run`)
      .set("Authorization", `Bearer ${token}`);
    const docs = run.body.data.checks.find((c: any) => c.id === "chk_docs");
    expect(docs).toMatchObject({ result: "pass" });
    expect(docs.detail).toBe("1 documentation file(s)");

    /* a log found on the outside keeps the panel it always had: no source row */
    const tests = run.body.data.checks.find((c: any) => c.id === "chk_tests");
    expect(tests.result).toBe("pass");
    expect(tests.rows.some((r: any) => r.label === "source")).toBe(false);
  });

  it("still fails Documentation when the archive carries none", async () => {
    const token = await register("f.nodocs@vaultlance.io");
    const id = await makeVault(token);

    const checks = await uploadAndRun(token, id, archive({ "site/index.html": "<h1>Corner Bean</h1>" }));

    const docs = checks.find((c) => c.id === "chk_docs")!;
    expect(docs.result).toBe("fail");
    expect(docs.detail).toBe("No README or document included");
  });

  it("counts the failures in the archive's own log, not just its name", async () => {
    const token = await register("f.failing@vaultlance.io");
    const id = await makeVault(token);

    const checks = await uploadAndRun(
      token,
      id,
      archive({ "site/README.md": "# Corner Bean", "site/test-log.txt": junit(2) })
    );

    const tests = checks.find((c) => c.id === "chk_tests")!;
    expect(tests.result).toBe("fail");
    expect(tests.detail).toBe("4 passed · 2 failed · 0 skipped");
  });
});
