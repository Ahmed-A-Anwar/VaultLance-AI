/* liveApi.ts — the freelancer surface's read seam against the deployed API.
   It repeats the three reads mockApi exposes (vaults, events, KPIs) with the
   same shapes, so FreelancerData switches source without a page changing.

   Mapping rules, in one place:
   - the backend's lifecycle folds onto the five client-side statuses;
   - the client member is the row's name and email;
   - a vault that is no longer a draft has been invited;
   - file counts come from the vault's own file list, because the list DTO
     does not carry them;
   - only ledger rows for this freelancer's vaults are kept. */

import { apiClient } from "../../lib/apiClient";
import { request } from "../../lib/http";
import { allTimePaidCents, inEscrowCents } from "../../lib/earnings";
import { phaseOf, type UiStatus } from "../../lib/freelancerPhase";
import type {
  FreelancerEvent,
  FreelancerEventType,
  FreelancerKpis,
  FreelancerVault,
  VaultFile,
} from "./mockApi";

/* the backend's lifecycle, folded onto the five statuses the UI knows */
function uiStatusOf(raw: string): UiStatus {
  const s = (raw || "").toUpperCase();
  if (["DRAFT", "AWAITING_CLIENT", "AWAITING_AUTHORIZATION"].includes(s)) return "awaiting_payment";
  if (["AUTHORIZED", "FUNDS_HELD", "IN_PROGRESS"].includes(s)) return "held";
  if (["AWAITING_APPROVAL", "SUBMITTED", "VERIFYING"].includes(s)) return "audited";
  if (["PAID", "CAPTURE_PENDING", "COMPLETED", "UNLOCKED"].includes(s)) return "unlocked";
  if (["CANCELLED", "EXPIRED", "VOIDED"].includes(s)) return "voided";
  return "held";
}

const SUBMITTED_STATUSES = ["SUBMITTED", "VERIFYING", "AWAITING_APPROVAL"];

const EVENT_TYPE: Record<string, FreelancerEventType> = {
  FUNDS_AUTHORIZED: "PAYMENT.AUTHORIZED",
  PAYMENT_CAPTURED: "PAYMENT.CAPTURED",
  MILESTONE_APPROVED: "FILES.SUBMITTED",
  AUDIT_COMPLETED: "AUDIT.COMPLETED",
  VAULT_CANCELLED: "PAYMENT.VOIDED",
  FILES_UPLOADED: "FILES.UPLOADED",
  PAYOUT_SENT: "PAYOUT.SENT",
  PAYOUT_FAILED: "PAYOUT.FAILED",
};

const ms = (value: unknown, fallback = Date.now()): number => {
  const at = value ? new Date(value as string).getTime() : NaN;
  return Number.isFinite(at) ? at : fallback;
};

async function filesFor(vaultId: string): Promise<VaultFile[]> {
  const res = await apiClient.uploads.list(vaultId);
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data.map((f: any) => ({
    name: String(f.fileName ?? "file"),
    sizeBytes: Number(f.fileSize) || 0,
  }));
}

async function toVault(raw: any): Promise<FreelancerVault> {
  const members: any[] = Array.isArray(raw.members) ? raw.members : [];
  const client = members.find((m) => String(m.role).toUpperCase() === "CLIENT");
  const status = String(raw.status ?? "");
  const createdAt = ms(raw.createdAt ?? raw.created_at);
  const files = await filesFor(String(raw.id));

  /* the vault read carries real fees only after capture; the payout read adds
     the one sentence a failed payout is allowed to show. Both are optional: a
     refused read must not hide the vault. */
  const captured = raw.fees && raw.fees.source === "captured" ? raw.fees : null;
  const payout = status.toUpperCase() === "PAID"
    ? await request<any>(`/vaults/${encodeURIComponent(String(raw.id))}/payout`).catch(() => null)
    : null;
  const payoutStatus =
    payout?.status === "paid"
      ? ("paid" as const)
      : payout?.status === "failed" || payout?.status === "blocked"
        ? ("failed" as const)
        : payout?.status === "pending" || payout?.status === "creating"
          ? ("pending" as const)
          : undefined;

  return {
    id: String(raw.id),
    project: String(raw.title ?? "Vault"),
    clientName: client?.fullName || (client?.email ? String(client.email).split("@")[0] : "Client"),
    clientEmail: String(client?.email ?? ""),
    amountCents: Math.round(Number(raw.amount ?? 0) * 100),
    uiStatus: uiStatusOf(status),
    kind: "other",
    ...(raw.description ? { description: String(raw.description) } : {}),
    ...(status.toUpperCase() === "DRAFT" ? {} : { invitedAt: createdAt }),
    ...(SUBMITTED_STATUSES.includes(status.toUpperCase())
      ? { submittedAt: ms(raw.updatedAt ?? raw.updated_at, createdAt) }
      : {}),
    filesCount: files.length,
    files,
    createdAt,
    ...(raw.paypal_capture_id ? { captureId: String(raw.paypal_capture_id) } : {}),
    ...(captured
      ? {
          capturedFees: {
            grossCents: Number(captured.grossCents),
            vaultlanceFeeCents: Number(captured.vaultlanceFeeCents),
            paypalFeeCents: Number(captured.paypalFeeCents),
            netCents: Number(captured.netCents),
            payoutCents: Number(captured.payoutCents),
            source: "captured" as const,
          },
        }
      : {}),
    ...(payoutStatus ? { payoutStatus } : {}),
    ...(payout?.failure?.message ? { payoutReason: String(payout.failure.message) } : {}),
  };
}

/** GET /api/vaults — every vault this freelancer owns or belongs to. */
export async function listFreelancerVaults(): Promise<FreelancerVault[]> {
  const res = await apiClient.vaults.list();
  if (!res.success || !Array.isArray(res.data)) {
    throw new Error(res.message || "The vault service didn’t answer.");
  }
  return Promise.all(res.data.map(toVault));
}

/** GET /api/ledger — scoped to the vaults passed in, newest first. */
export async function listFreelancerEvents(vaults: FreelancerVault[]): Promise<FreelancerEvent[]> {
  const res = await apiClient.ledger.list();
  if (!res.success || !Array.isArray(res.data)) return [];

  const projects = new Map(vaults.map((v) => [v.id, v.project]));
  const events: FreelancerEvent[] = [];

  for (const e of res.data as any[]) {
    if (!projects.has(String(e.vault_id))) continue;
    /* a row with no client meaning (a creation, an upload, a payout) is
       dropped rather than relabelled: defaulting to PAYMENT.AUTHORIZED drew a
       second authorization of the same amount for every vault, which read as a
       duplicated ledger */
    const type = EVENT_TYPE[String(e.event_type)];
    if (!type) continue;

    const amount = Number(e.amount);
    const paypalId = e.metadata?.authorizationId || e.metadata?.captureId || e.metadata?.orderId || e.metadata?.paypalId;
    events.push({
      id: String(e.id),
      at: new Date(ms(e.created_at ?? e.createdAt)).toISOString(),
      type,
      vaultId: String(e.vault_id),
      vaultProject: projects.get(String(e.vault_id)) ?? "Vault",
      ...(Number.isFinite(amount) && amount > 0 ? { amountCents: Math.round(amount * 100) } : {}),
      ...(paypalId ? { paypalId: String(paypalId) } : {}),
      ...(e.metadata?.note ? { note: String(e.metadata.note) } : {}),
    });
  }

  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The strip: the same earnings selectors the earnings page reads, so PAID and
    IN ESCROW cannot drift between the two views. */
export function kpisFor(vaults: FreelancerVault[]): FreelancerKpis {
  return {
    inEscrowCents: inEscrowCents(vaults),
    inReviewCount: vaults.filter((v) => {
      const phase = phaseOf(v);
      return phase === "in_review" || phase === "submitted";
    }).length,
    paidOutCents: allTimePaidCents(vaults),
  };
}
