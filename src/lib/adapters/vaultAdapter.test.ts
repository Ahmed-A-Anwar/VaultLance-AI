import { describe, expect, it } from "vitest";
import { amountKnown, toClientVault, toFreelancerVault } from "./vaultAdapter";

const full = {
  id: "b2831415-9f89-430f-8581-b2c8ec757074",
  freelancerId: "f-1",
  title: "Logo Pack",
  description: "Three marks",
  amount: 2400,
  currency: "USD",
  status: "AUTHORIZED",
  expiresAt: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-02T12:30:00.000Z",
  members: [
    { id: "m1", role: "FREELANCER", fullName: "Maya Chen", email: "maya@example.com" },
    { id: "m2", role: "CLIENT", fullName: "Ahmed Anwar", email: "ahmed@example.com" },
  ],
  files: [
    { id: "f1", fileName: "logo.zip" },
    { id: "f2", fileName: "readme.md" },
  ],
};

describe("vaultAdapter", () => {
  it("maps a complete vault onto the client shape", () => {
    const v = toClientVault(full);
    expect(v).toEqual({
      id: full.id,
      project: "Logo Pack",
      freelancer: "Maya Chen",
      amountUSD: 2400,
      status: "held",
      createdAt: Date.parse("2026-11-01T10:00:00.000Z"),
      /* ids are kept so a paid card can ask for that file's signed link */
      files: [
        { id: "f1", name: "logo.zip" },
        { id: "f2", name: "readme.md" },
      ],
    });
  });

  it("maps the same row onto the freelancer shape", () => {
    const v = toFreelancerVault(full);
    expect(v?.amountCents).toBe(240_000);
    expect(v?.uiStatus).toBe("held");
    expect(v?.clientName).toBe("Ahmed Anwar");
    expect(v?.clientEmail).toBe("ahmed@example.com");
    expect(v?.filesCount).toBe(2);
    expect(v?.files[0]).toEqual({ name: "logo.zip", sizeBytes: 0 });
    expect(v?.invitedAt).toBe(Date.parse("2026-11-01T10:00:00.000Z"));
    expect(v?.submittedAt).toBeUndefined();
    expect(v?.payoutStatus).toBeUndefined();
  });

  it("marks a submitted vault as submitted", () => {
    const v = toFreelancerVault({ ...full, status: "AWAITING_APPROVAL" });
    expect(v?.uiStatus).toBe("audited");
    expect(v?.submittedAt).toBe(Date.parse("2026-11-02T12:30:00.000Z"));
  });

  it("does not invite a draft", () => {
    expect(toFreelancerVault({ ...full, status: "DRAFT" })?.invitedAt).toBeUndefined();
  });

  it("leaves missing fields missing instead of inventing them", () => {
    const v = toClientVault({ ...full, members: undefined, paypal_order_id: undefined });
    expect(v?.freelancer).toBe("—");
    expect(v?.paypalOrderId).toBeUndefined();
    expect(toClientVault({ ...full, files: undefined })?.files).toBeUndefined();

    const f = toFreelancerVault({ ...full, members: undefined, files: undefined, description: undefined });
    expect(f?.clientName).toBe("—");
    expect(f?.clientEmail).toBe("");
    expect(f?.filesCount).toBe(0);
    expect(f?.description).toBeUndefined();

    expect(amountKnown({ ...full, amount: undefined })).toBe(false);
  });

  it("ignores extra fields", () => {
    const v = toClientVault({ ...full, paypal_capture_id: "3NC90646EJ330354Y", supabase_row: { id: 1 } });
    expect(v?.status).toBe("held");
    expect(v?.paypalOrderId).toBe("3NC90646EJ330354Y");
  });

  it("survives a bad date without producing NaN", () => {
    const v = toClientVault({ ...full, createdAt: "not-a-date" });
    expect(v?.createdAt).toBe(0);
    const f = toFreelancerVault({ ...full, createdAt: "not-a-date", updatedAt: "nope" });
    expect(f?.createdAt).toBe(0);
    expect(f?.invitedAt).toBeUndefined();
    expect(f?.submittedAt).toBeUndefined();
  });

  it("handles zero and large amounts", () => {
    expect(toClientVault({ ...full, amount: 0 })?.amountUSD).toBe(0);
    expect(toFreelancerVault({ ...full, amount: 0 })?.amountCents).toBe(0);
    expect(toClientVault({ ...full, amount: 999_999.99 })?.amountUSD).toBe(999_999.99);
    expect(toFreelancerVault({ ...full, amount: 999_999.99 })?.amountCents).toBe(99_999_999);
  });

  it("accepts a numeric string amount, as Postgres may send it", () => {
    expect(toClientVault({ ...full, amount: "2400.00" })?.amountUSD).toBe(2400);
    expect(toFreelancerVault({ ...full, amount: "2400.00" })?.amountCents).toBe(240_000);
  });

  it("returns null when the payload cannot be a vault", () => {
    expect(toClientVault(null)).toBeNull();
    expect(toClientVault({})).toBeNull();
    expect(toClientVault({ ...full, id: "" })).toBeNull();
    expect(toClientVault({ ...full, amount: "lots" })).toBeNull();
    expect(toFreelancerVault("vault")).toBeNull();
  });

  it("renders voided for a cancelled row and keeps it out of unlocked", () => {
    expect(toClientVault({ ...full, status: "CANCELLED" })?.status).toBe("voided");
    expect(toClientVault({ ...full, status: "CAPTURE_PENDING" })?.status).toBe("audited");
    expect(toClientVault({ ...full, status: "PAID" })?.status).toBe("unlocked");
  });
});
