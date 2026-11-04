import { describe, it, expect, beforeEach, vi } from "vitest";
import { inMemoryStore } from "../src/shared/db.js";

const paypal = vi.hoisted(() => ({
  getCapture: vi.fn(),
  captureAuthorization: vi.fn(),
  createPayout: vi.fn(),
}));
vi.mock("../src/paypal/payments.client.js", () => paypal);

const { confirmCapture } = await import("../src/money/capture.service.js");
const { approveVault } = await import("../src/money/approve.service.js");
const store = await import("../src/money/money.store.js");

const VAULT = "vault-money-1";
const FREELANCER = "user-freelancer-1";
const CLIENT = "user-client-1";

function seed(status: string) {
  inMemoryStore.clear();
  store.memory.reset();

  inMemoryStore.users.set(FREELANCER, {
    id: FREELANCER,
    email: "freelancer@example.com",
    password_hash: "x",
    full_name: "Freelancer",
    role: "FREELANCER",
    account_status: "ACTIVE",
    created_at: new Date(),
    updated_at: new Date(),
  });

  inMemoryStore.vaults.set(VAULT, {
    id: VAULT,
    freelancer_id: FREELANCER,
    title: "Money loop",
    description: "test",
    amount: 250,
    currency: "USD",
    status,
    created_at: new Date(),
    updated_at: new Date(),
  });

  inMemoryStore.members.set("m-client", {
    id: "m-client",
    vault_id: VAULT,
    user_id: CLIENT,
    role: "CLIENT",
    invitation_status: "ACCEPTED",
    created_at: new Date(),
  });

  paypal.getCapture.mockReset();
  paypal.captureAuthorization.mockReset();
  paypal.createPayout.mockReset();

  paypal.getCapture.mockResolvedValue({
    id: "cap-1",
    status: "COMPLETED",
    amountCents: 25000,
    currency: "USD",
    feeCents: 1000,
    netCents: 24000,
  });
  paypal.createPayout.mockResolvedValue({ batchId: "batch-1", itemId: "item-1", status: "PENDING" });
}

describe("money loop – confirmCapture", () => {
  beforeEach(() => seed("CAPTURE_PENDING"));

  it("refuses a capture unless the vault is CAPTURE_PENDING", async () => {
    inMemoryStore.vaults.get(VAULT)!.status = "AUTHORIZED";
    await expect(confirmCapture(VAULT, "cap-1", "fallback")).rejects.toMatchObject({
      code: "INVALID_VAULT_STATUS",
    });
  });

  it("rejects a capture whose amount is not the stored amount", async () => {
    paypal.getCapture.mockResolvedValue({
      id: "cap-1",
      status: "COMPLETED",
      amountCents: 26000,
      currency: "USD",
      feeCents: 1000,
      netCents: 25000,
    });
    await expect(confirmCapture(VAULT, "cap-1", "webhook")).rejects.toMatchObject({
      code: "AMOUNT_MISMATCH",
    });
    expect(inMemoryStore.vaults.get(VAULT)!.status).toBe("CAPTURE_PENDING");
  });

  it("pays the freelancer net minus 5% and creates exactly one payout", async () => {
    const result = await confirmCapture(VAULT, "cap-1", "webhook");

    expect(result.status).toBe("PAID");
    expect(result.payoutCents).toBe(22750); // 24000 - round(25000 * 0.05)
    expect(result.payoutStatus).toBe("pending");
    expect(paypal.createPayout).toHaveBeenCalledTimes(1);

    const capture = store.memory.captures.get(VAULT)!;
    expect(capture.grossCents).toBe(25000);
    expect(capture.feeCents).toBe(1000);
    expect(capture.netCents).toBe(24000);
    expect(store.memory.ledger.map((row) => row.event_type)).toEqual([
      "PAYMENT.CAPTURED",
      "FILES.UNLOCKED",
      "PAYOUT.CREATED",
    ]);
  });

  it("creates one payout when two confirms race", async () => {
    const results = await Promise.all([
      confirmCapture(VAULT, "cap-1", "webhook"),
      confirmCapture(VAULT, "cap-1", "fallback"),
    ]);

    expect(results.every((r) => r.status === "PAID")).toBe(true);
    expect(paypal.createPayout).toHaveBeenCalledTimes(1);
    expect(store.memory.payouts.size).toBe(1);
    expect(inMemoryStore.vaults.get(VAULT)!.status).toBe("PAID");
  });
});

describe("money loop – approval", () => {
  beforeEach(() => seed("AWAITING_APPROVAL"));

  it("refuses approval from anyone but the invited client", async () => {
    await expect(approveVault(VAULT, FREELANCER)).rejects.toMatchObject({
      code: "CLIENT_ROLE_REQUIRED",
    });
  });

  it("refuses approval in the wrong state", async () => {
    inMemoryStore.vaults.get(VAULT)!.status = "AUTHORIZED";
    await expect(approveVault(VAULT, CLIENT)).rejects.toMatchObject({
      code: "INVALID_VAULT_STATUS",
    });
  });

  it("captures, unlocks and pays on a client approval", async () => {
    store.memory.reset();
    inMemoryStore.members.set("m-client", {
      id: "m-client",
      vault_id: VAULT,
      user_id: CLIENT,
      role: "CLIENT",
      invitation_status: "ACCEPTED",
      created_at: new Date(),
    });
    paypal.captureAuthorization.mockResolvedValue({
      id: "cap-1",
      status: "COMPLETED",
      amountCents: 25000,
      currency: "USD",
      feeCents: 1000,
      netCents: 24000,
    });
    await store.rememberAuthorization(VAULT, "auth-1");

    const result = await approveVault(VAULT, CLIENT);
    expect(result.status).toBe("PAID");
    expect(paypal.captureAuthorization).toHaveBeenCalledWith({
      authorizationId: "auth-1",
      amountCents: 25000,
      currency: "USD",
    });
    expect(inMemoryStore.vaults.get(VAULT)!.status).toBe("PAID");
  });
});
