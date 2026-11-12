import type { VaultStatus } from "../shared/types.js";

export type { VaultStatus };

export interface VaultFileItem {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  sha256Hash: string;
  createdAt: Date;
}

export interface VaultMemberItem {
  id: string;
  userId: string;
  email?: string;
  fullName?: string;
  role: "FREELANCER" | "CLIENT";
  invitationStatus: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED";
  joinedAt?: Date | null;
  createdAt: Date;
}

/* Real fees, read from vault_captures after PayPal captured the money. Integer
   cents; absent until a capture exists, so an estimate cannot be mistaken for a
   receipt. */
export interface VaultCapturedFees {
  grossCents: number;
  vaultlanceFeeCents: number;
  paypalFeeCents: number;
  netCents: number;
  payoutCents: number;
  source: "captured";
}

export interface VaultDTO {
  id: string;
  freelancerId: string;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  status: VaultStatus;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  members?: VaultMemberItem[];
  files?: VaultFileItem[];
  /* the ids a receipt prints; each can be absent when PayPal has not got there */
  paypalOrderId?: string | null;
  paypalAuthorizationId?: string | null;
  paypalCaptureId?: string | null;
  /* the payout that follows a capture: "paid", "failed", or absent */
  payoutStatus?: string | null;
  payoutPaypalId?: string | null;
  fees?: VaultCapturedFees;
  /* the failed report, what was waived at approval, and the revision request */
  failedChecks?: Array<{ id: string; name: string; detail?: string }>;
  waivedChecks?: Array<{ checkId: string; name: string; reason?: string; waivedAt?: string; waivedBy?: string }>;
  revisionNote?: string | null;
}
