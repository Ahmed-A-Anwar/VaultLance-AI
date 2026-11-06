import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
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
    .send({ title: "Audit conversation", description: "Release candidate", amount: 120 });
  const id = created.body.data.id as string;
  database.store.vaults.get(id)!.status = "AUTHORIZED";
  return id;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("audit conversation persistence", () => {
  beforeEach(() => {
    database.reset();
    resetAuditUsageForTests();
    resetAuditReportsForTests();
    __resetAiProviderForTests();
    process.env.AZURE_OPENAI_KEY = "";
    process.env.GROQ_API_KEY = "";
    process.env.GEMINI_API_KEY = "";
  });

  it("returns every question and answer when the room is reopened", async () => {
    const token = await register("f.persist@vaultlance.io");
    const id = await makeVault(token);

    const fresh = await request(app).get(`/api/vaults/${id}/audit-detail`).set(auth(token));
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.messages).toEqual([]);

    const questions = ["What files were delivered?", "Are there any issues?"];
    for (const question of questions) {
      const asked = await request(app).post(`/api/vaults/${id}/chat`).set(auth(token)).send({ question });
      expect(asked.status).toBe(200);
      expect(asked.body.data.text.length).toBeGreaterThan(0);
    }

    /* a different request, as if the reader had left and come back */
    const reopened = await request(app).get(`/api/vaults/${id}/audit-detail`).set(auth(token));
    expect(reopened.status).toBe(200);

    const messages = reopened.body.data.messages;
    expect(messages).toHaveLength(4);
    expect(messages.map((m: any) => m.role)).toEqual(["user", "ai", "user", "ai"]);
    expect(messages.map((m: any) => m.text)).toEqual([
      questions[0],
      expect.any(String),
      questions[1],
      expect.any(String),
    ]);
    expect(messages[0].sources).toEqual([]);
    expect(Array.isArray(messages[1].sources)).toBe(true);
    expect(typeof messages[1].cached).toBe("boolean");
    /* the persisted turns and the persisted question counter agree */
    expect(reopened.body.data.questionsUsed).toBe(2);
  });

  it("keeps each vault's conversation separate", async () => {
    const token = await register("f.persist-two@vaultlance.io");
    const first = await makeVault(token);
    const second = await makeVault(token);

    await request(app)
      .post(`/api/vaults/${first}/chat`)
      .set(auth(token))
      .send({ question: "Only for the first vault" });

    const other = await request(app).get(`/api/vaults/${second}/audit-detail`).set(auth(token));
    expect(other.status).toBe(200);
    expect(other.body.data.messages).toEqual([]);

    const mine = await request(app).get(`/api/vaults/${first}/audit-detail`).set(auth(token));
    expect(mine.body.data.messages).toHaveLength(2);
  });
});
