import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import AdmZip from "adm-zip";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";

describe("Step 8 – Secure File Upload & ZIP Security Checks", () => {
  let freelancerToken: string;
  let vaultId: string;

  beforeEach(async () => {
    database.reset();

    const fRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: "uploader@vaultlance.io",
        password: "Password123!",
        fullName: "Uploader Dev",
        role: "FREELANCER",
      });
    freelancerToken = fRes.body.data.token;

    const vRes = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({
        title: "File Deliverable Vault",
        amount: 2000,
      });
    vaultId = vRes.body.data.id;
  });

  it("should successfully upload a valid text file and generate randomized object key", async () => {
    const fileContent = "Vault deliverable content for milestone #1";
    const res = await request(app)
      .post(`/api/uploads/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .attach("file", Buffer.from(fileContent), "report.txt");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fileName).toBe("report.txt");
    expect(res.body.data.sha256Hash).toBeDefined();
    // Verify randomized key does not mirror user path directly
    expect(res.body.data.storageKey.startsWith(`vault-${vaultId}`)).toBe(true);
  });

  it("should reject disallowed executable file extensions", async () => {
    const exeBuffer = Buffer.from("MZ malicious binary payload");
    const res = await request(app)
      .post(`/api/uploads/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .attach("file", exeBuffer, "malware.exe");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("DISALLOWED_FILE_EXTENSION");
  });

  it("should reject double extension attacks (e.g. payload.exe.zip)", async () => {
    const zip = new AdmZip();
    zip.addFile("test.txt", Buffer.from("safe text"));
    const buffer = zip.toBuffer();

    const res = await request(app)
      .post(`/api/uploads/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .attach("file", buffer, "payload.exe.zip");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("DOUBLE_EXTENSION_ATTACK");
  });

  it("should detect and reject Zip Slip vulnerability in ZIP archive", async () => {
    const maliciousZip = new AdmZip();
    maliciousZip.addFile("test.txt", Buffer.from("traversal payload"));
    const entries = maliciousZip.getEntries();
    if (entries[0]) {
      entries[0].entryName = "../../../traversal.txt";
    }
    const buffer = maliciousZip.toBuffer();

    const res = await request(app)
      .post(`/api/uploads/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .attach("file", buffer, "exploit.zip");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ZIP_SLIP_DETECTED");
  });

  it("should reject ZIP archive containing disallowed executables", async () => {
    const badZip = new AdmZip();
    badZip.addFile("subfolder/trojan.exe", Buffer.from("fake binary"));
    const buffer = badZip.toBuffer();

    const res = await request(app)
      .post(`/api/uploads/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .attach("file", buffer, "bad_archive.zip");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("DANGEROUS_FILE_EXTENSION");
  });

  it("should reject a nested archive beyond depth 1", async () => {
    const inner = new AdmZip();
    inner.addFile("again.zip", Buffer.from("not a real zip"));
    const outer = new AdmZip();
    outer.addFile("notes.txt", Buffer.from("safe"));
    outer.addFile("inner.zip", inner.toBuffer());

    const res = await request(app)
      .post(`/api/uploads/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .attach("file", outer.toBuffer(), "nested.zip");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ZIP_NESTING_DEPTH_EXCEEDED");
  });
});
