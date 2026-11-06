/* payout.ts — the payout status read, one shape for the real API and the demo.
   The server decides what a role may see; this module only names it. */

import { request } from "./http";
import { isDemoMode } from "./apiClient";
import { freelancerPayoutEstimate, paypalFeeEstimate, vaultlanceFee } from "./fees";
import type { Payout } from "../components/payments/paymentsModel";

export type ServerPayoutStatus = "none" | "creating" | "pending" | "paid" | "failed" | "blocked";

export interface PayoutFailure {
  code: string;
  message: string;
}

export interface FreelancerPayoutView {
  role: "freelancer";
  status: ServerPayoutStatus;
  attempt: number;
  cents: {
    gross: number;
    vaultlanceFee: number;
    paypalFee: number;
    net: number;
    payout: number;
  } | null;
  payoutItemId: string | null;
  timestamps: { createdAt: string | null; updatedAt: string | null };
  failure: PayoutFailure | null;
}

export interface ClientPayoutView {
  role: "client";
  status: ServerPayoutStatus;
  timestamps: { createdAt: string | null; updatedAt: string | null };
}

export type PayoutView = FreelancerPayoutView | ClientPayoutView;

const isStatus = (value: unknown): value is ServerPayoutStatus =>
  ["none", "creating", "pending", "paid", "failed", "blocked"].includes(String(value));

/** GET /api/vaults/:id/payout, defended against a shape the API may grow. */
export async function readPayout(vaultId: string): Promise<PayoutView> {
  if (!isDemoMode()) {
    const raw = await request<any>(`/vaults/${encodeURIComponent(vaultId)}/payout`);
    return {
      role: raw?.role === "client" ? "client" : "freelancer",
      status: isStatus(raw?.status) ? raw.status : "none",
      ...(raw?.role === "client"
        ? {}
        : {
            attempt: Number(raw?.attempt) || 0,
            cents: raw?.cents ?? null,
            payoutItemId: raw?.payoutItemId ?? null,
            failure: raw?.failure?.message
              ? { code: String(raw.failure.code ?? "PAYOUT_FAILED"), message: String(raw.failure.message) }
              : null,
          }),
      timestamps: {
        createdAt: raw?.timestamps?.createdAt ?? null,
        updatedAt: raw?.timestamps?.updatedAt ?? null,
      },
    } as PayoutView;
  }

  const mock = await mockPayout(vaultId);
  return mock;
}

/** The demo's profile of the same read: the row's status and the same estimate. */
async function mockPayout(vaultId: string): Promise<PayoutView> {
  const { listFreelancerVaults } = await import("../components/freelancer/mockApi");
  const vaults = await listFreelancerVaults();
  const vault = vaults.find((v) => v.id === vaultId);
  if (!vault) throw new Error("Vault not found.");
  const status: ServerPayoutStatus =
    vault.payoutStatus === "paid"
      ? "paid"
      : vault.payoutStatus === "failed"
        ? "failed"
        : vault.payoutStatus === "pending"
          ? "pending"
          : "none";
  return {
    role: "freelancer",
    status,
    attempt: status === "none" ? 0 : 1,
    cents: {
      gross: vault.amountCents,
      vaultlanceFee: vaultlanceFee(vault.amountCents),
      paypalFee: paypalFeeEstimate(vault.amountCents),
      net: vault.amountCents - paypalFeeEstimate(vault.amountCents),
      payout: freelancerPayoutEstimate(vault.amountCents),
    },
    payoutItemId: vault.payoutPaypalId ?? null,
    timestamps: {
      createdAt: new Date(vault.lastEventAt ?? vault.createdAt).toISOString(),
      updatedAt: new Date(vault.lastEventAt ?? vault.createdAt).toISOString(),
    },
    failure:
      status === "failed"
        ? { code: "PAYMENT.RECEIVER_UNREGISTERED", message: "PayPal could not reach the recipient." }
        : null,
  };
}

/** The chip on a Payments row: the server's six states, not the row's three. */
export function payoutChip(status: ServerPayoutStatus | undefined): { label: string; tone: string } | null {
  if (!status) return null;
  switch (status) {
    case "paid":
      return { label: "PAID", tone: "ok" };
    case "failed":
      return { label: "FAILED", tone: "danger" };
    case "blocked":
      return { label: "BLOCKED", tone: "danger" };
    case "creating":
      return { label: "CREATING", tone: "brass" };
    case "pending":
      return { label: "PENDING", tone: "brass" };
    case "none":
      return { label: "QUEUED", tone: "brass" };
  }
}

export function payoutStatusOf(status: ServerPayoutStatus): Payout["status"] {
  if (status === "paid") return "paid";
  if (status === "failed" || status === "blocked") return "failed";
  return "pending";
}
