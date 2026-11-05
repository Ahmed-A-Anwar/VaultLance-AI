/* vaultAdapter.ts — a backend vault record onto the two shapes the frontend
   already draws: the client's Vault and the freelancer's FreelancerVault.

   Adapters never invent data. A field the response does not carry stays
   undefined (or unknown), and the UI prints "—". A response that fails the
   schema returns null so the caller can show an error state instead of
   rendering a half-vault. Extra fields in the payload are ignored, not fatal. */

import { z } from "zod";
import { amountSchema, centsOf } from "./moneyAdapter";
import { uiStatusOf, type UiStatus } from "./statusMap";
import type { Vault as ClientVault } from "../api";
import type { FreelancerVault, VaultFile as FreelancerFile } from "../../components/freelancer/mockApi";

export const memberSchema = z.object({
  role: z.string(),
  fullName: z.string().nullish(),
  email: z.string().nullish(),
});

export const vaultSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().nullish(),
  /* a non-numeric amount must fail the parse: an unreadable figure is an
     error state, never a vault worth $0 */
  amount: amountSchema,
  currency: z.string().nullish(),
  status: z.string(),
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  members: z.array(memberSchema).nullish(),
  files: z.array(z.object({ id: z.string(), fileName: z.string().nullish() })).nullish(),
  paypal_order_id: z.string().nullish(),
  paypalOrderId: z.string().nullish(),
  paypal_capture_id: z.string().nullish(),
  paypalCaptureId: z.string().nullish(),
});

const SUBMITTED = ["SUBMITTED", "VERIFYING", "AWAITING_APPROVAL", "CAPTURE_PENDING"];

/** ISO or epoch → milliseconds, or undefined when the value is not a date. */
export function msOf(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : undefined;
}

const memberOf = (
  members: Array<{ role: string; fullName?: string | null; email?: string | null }> | null | undefined,
  role: string
) => members?.find((m) => m.role.trim().toUpperCase() === role);

/** The client's Vault — the shape the dashboard's cards and totals read. */
export function toClientVault(raw: unknown): ClientVault | null {
  const parsed = vaultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const dto = parsed.data;
  const cents = centsOf(dto.amount);
  const order = dto.paypalOrderId ?? dto.paypal_order_id ?? dto.paypal_capture_id ?? dto.paypalCaptureId;
  return {
    id: dto.id,
    project: dto.title,
    freelancer: memberOf(dto.members, "FREELANCER")?.fullName ?? "—",
    /* 0 is the "unknown" sentinel: amountKnown says which it is, so a missing
       amount can never read as a free vault */
    amountUSD: cents === undefined ? 0 : cents / 100,
    status: uiStatusOf(dto.status),
    createdAt: msOf(dto.createdAt) ?? 0,
    ...(order ? { paypalOrderId: String(order) } : {}),
  };
}

/** Did the response carry a readable amount? Derived from the same parse. */
export function amountKnown(raw: unknown): boolean {
  const parsed = vaultSchema.safeParse(raw);
  return parsed.success && centsOf(parsed.data.amount) !== undefined;
}

/** The freelancer's view: finer phases, integer cents, client and file count. */
export function toFreelancerVault(raw: unknown): FreelancerVault | null {
  const parsed = vaultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const dto = parsed.data;
  const status = dto.status.trim().toUpperCase();
  const uiStatus: UiStatus = uiStatusOf(status);
  const client = memberOf(dto.members, "CLIENT");
  const files: FreelancerFile[] = (dto.files ?? []).map((f) => ({
    name: String(f.fileName ?? "file"),
    sizeBytes: 0,
  }));
  const createdAt = msOf(dto.createdAt);
  const updatedAt = msOf(dto.updatedAt);
  const cents = centsOf(dto.amount);
  const capture = dto.paypal_capture_id ?? dto.paypalCaptureId;

  return {
    id: dto.id,
    project: dto.title,
    clientName: client?.fullName ?? (client?.email ? String(client.email).split("@")[0] : "—"),
    clientEmail: client?.email ?? "",
    amountCents: cents ?? 0,
    uiStatus,
    kind: "other",
    ...(dto.description ? { description: dto.description } : {}),
    ...(status === "DRAFT" ? {} : createdAt === undefined ? {} : { invitedAt: createdAt }),
    ...(SUBMITTED.includes(status) && updatedAt !== undefined ? { submittedAt: updatedAt } : {}),
    filesCount: files.length,
    files,
    createdAt: createdAt ?? 0,
    ...(capture ? { captureId: String(capture) } : {}),
    /* the payout status is not on this DTO: it arrives with the capture
       response, so the list row leaves it unset rather than guessing */
  };
}
