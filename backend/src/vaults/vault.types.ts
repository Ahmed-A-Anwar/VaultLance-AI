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
}
