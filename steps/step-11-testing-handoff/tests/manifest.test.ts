import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { database } from "../src/shared/db.js";

describe("Step 9 – Manifest & SHA-256 Canonicalization & Reproducibility", () => {
  let freelancerToken: string;
  let vaultId: string;

  beforeEach(async () => {
    database.reset();

    const fRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: "manifest.tester@vaultlance.io",
        password: "Password123!",
        fullName: "Manifest Dev",
        role: "FREELANCER",
      });
    freelancerToken = fRes.body.data.token;

    const vRes = await request(app)
      .post("/api/vaults")
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({
        title: "Canonical Manifest Vault",
        amount: 5000,
      });
    vaultId = vRes.body.data.id;

    // Upload multiple files in unsorted order
    await request(app)
      .post(`/api/uploads/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .attach("file", Buffer.from("Zebra final documentation"), "zebra.txt");

    await request(app)
      .post(`/api/uploads/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .attach("file", Buffer.from("Alpha introductory guide"), "alpha.txt");

    await request(app)
      .post(`/api/uploads/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .attach("file", Buffer.from("Beta design specifications"), "beta.txt");
  });

  it("should generate a canonical manifest sorted deterministically by stable identifier", async () => {
    const res = await request(app)
      .get(`/api/manifests/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const manifest = res.body.data;

    expect(manifest.totalFiles).toBe(3);
    expect(manifest.manifestHash).toBeDefined();
    expect(manifest.canonicalString).toBeDefined();

    // Verify alphabetical sorting by filename / normalized path
    const fileNames = manifest.files.map((f: any) => f.fileName);
    expect(fileNames).toEqual(["alpha.txt", "beta.txt", "zebra.txt"]);
  });

  it("should verify 100% manifest reproducibility across multiple calls", async () => {
    const run1 = await request(app)
      .get(`/api/manifests/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`);

    const run2 = await request(app)
      .get(`/api/manifests/${vaultId}`)
      .set("Authorization", `Bearer ${freelancerToken}`);

    expect(run1.body.data.manifestHash).toBe(run2.body.data.manifestHash);
    expect(run1.body.data.canonicalString).toBe(run2.body.data.canonicalString);

    // Call verify endpoint
    const verifyRes = await request(app)
      .post(`/api/manifests/${vaultId}/verify`)
      .set("Authorization", `Bearer ${freelancerToken}`);

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.reproducible).toBe(true);
    expect(verifyRes.body.data.expectedHash).toBe(run1.body.data.manifestHash);
    expect(verifyRes.body.data.computedHash).toBe(run1.body.data.manifestHash);
  });
});
