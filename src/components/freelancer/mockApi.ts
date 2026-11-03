/* mockApi.ts — the freelancer dashboard's data seam, and nothing else's. Every
   function names the endpoint it will call once the service is real; until then
   it answers from module memory with 300–618ms of latency and, while
   FX.mockErrors is on, a 5% failure so the error states stay reachable.

   Never mixed with live data: the client dashboard reads src/lib/api.ts, this
   reads nothing else. */

import { FX } from "../../config/fx";
import { canCreateVault, freelancerPayoutEstimate, MIN_AMOUNT_CENTS, MAX_AMOUNT_CENTS } from "../../lib/fees";
import { phaseOf, sortByNeed, type PayoutStatus, type Phase } from "../../lib/freelancerPhase";
import type { VaultStatus } from "../../lib/api";
import { newInviteCode, registerInvite } from "./inviteRegistry";
import {
  ARCHIVE_LIMITS,
  BLOCKED_HOSTS,
  LATENCY_MAX_MS,
  LATENCY_MIN_MS,
  MOCK_ERROR_RATE,
  PRIVATE_IPV4,
  SCAN_STEPS,
  type ScanStep,
} from "./mockConfig";

/* ----------------------------------------------------------------- types --- */

export type FreelancerVaultKind = "web" | "design" | "other";

export interface FreelancerFile {
  name: string;
  sizeBytes: number;
}

export interface FreelancerVault {
  id: string;
  project: string;
  clientName: string;
  clientEmail: string;
  amountCents: number;
  uiStatus: VaultStatus;
  kind: FreelancerVaultKind;
  description?: string;
  invitedAt?: number;
  submittedAt?: number;
  filesCount: number;
  files: FreelancerFile[];
  manifestSha256?: string;
  inviteCode?: string;
  stagingUrl?: string;
  payoutStatus?: PayoutStatus;
  payoutPaypalId?: string;
  createdAt: number;
  lastRemindedAt?: number;
}

export type FreelancerEventType =
  | "VAULT.CREATED"
  | "CLIENT.INVITED"
  | "PAYMENT.AUTHORIZED"
  | "FILES.UPLOADED"
  | "FILES.SUBMITTED"
  | "AUDIT.COMPLETED"
  | "PAYMENT.CAPTURED"
  | "PAYOUT.SENT"
  | "PAYOUT.FAILED"
  | "PAYMENT.VOIDED";

export interface FreelancerEvent {
  id: string;
  ts: number;
  type: FreelancerEventType;
  vaultId: string;
  label: string;
  amountCents?: number;
  paypalId?: string;
}

export interface FreelancerKpis {
  /** sum of the payout estimate for held + audited vaults */
  inEscrowCents: number;
  /** audited + submitted */
  inReview: number;
  /** actual (mocked) payouts already sent */
  paidOutCents: number;
}

export type FreelancerErrorCode = "network" | "not_found" | "state" | "validation" | "rate_limit";

export class FreelancerApiError extends Error {
  code: FreelancerErrorCode;
  constructor(code: FreelancerErrorCode, message: string) {
    super(message);
    this.name = "FreelancerApiError";
    this.code = code;
  }
}

/* --------------------------------------------------------------- storage --- */

const STORAGE_KEY = "vl.fd.store";

let vaults: FreelancerVault[] = [];
let events: FreelancerEvent[] = [];
let seq = 0;

const listeners = new Set<(event: FreelancerEvent) => void>();

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++seq).toString(36)}`;

const hasWindow = () => typeof window !== "undefined" && !!window.sessionStorage;

/* sessionStorage is a convenience, never a requirement: a browser that blocks
   it still gets the full mock for the tab's lifetime */
function persist(): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ vaults, events }));
  } catch {
    /* quota or a blocked store: memory is enough */
  }
}

function hydrate(): boolean {
  if (!hasWindow()) return false;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { vaults?: FreelancerVault[]; events?: FreelancerEvent[] };
    if (!Array.isArray(parsed.vaults)) return false;
    vaults = parsed.vaults;
    events = Array.isArray(parsed.events) ? parsed.events : [];
    return vaults.length > 0;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ seed --- */

const DAY = 86_400_000;
const PAYPAL = (s: string) => `8XK${s}`;

const file = (name: string, sizeBytes: number): FreelancerFile => ({ name, sizeBytes });

function seed(): void {
  const now = Date.now();

  vaults = [
    {
      id: "fv_icon",
      project: "Icon Set",
      clientName: "Ahmed",
      clientEmail: "ahmed@example.com",
      amountCents: 12_000,
      uiStatus: "unlocked",
      kind: "design",
      invitedAt: now - 28 * DAY,
      submittedAt: now - 10 * DAY,
      filesCount: 3,
      files: [file("icons.zip", 4_812_004), file("preview.png", 388_120), file("LICENSE.txt", 1_048)],
      manifestSha256: "9f2c41ab6d0e57c3a8b41e0d2c79fa63bd1830e7c49a5b62d8f1046ab7c39e52",
      inviteCode: "VL-4JQ8-2MZD",
      payoutStatus: "failed",
      createdAt: now - 30 * DAY,
    },
    {
      id: "fv_logo",
      project: "Logo Pack",
      clientName: "Ahmed",
      clientEmail: "ahmed@example.com",
      amountCents: 18_000,
      uiStatus: "held",
      kind: "design",
      invitedAt: now - 18 * DAY,
      filesCount: 4,
      files: [file("logo-light.svg", 18_204), file("logo-dark.svg", 18_110), file("mark.png", 92_400), file("README.md", 2_120)],
      inviteCode: "VL-3NP6-8QKT",
      createdAt: now - 20 * DAY,
    },
    {
      id: "fv_pitch",
      project: "Pitch Deck",
      clientName: "Ahmed",
      clientEmail: "ahmed@example.com",
      amountCents: 45_000,
      uiStatus: "awaiting_payment",
      kind: "design",
      filesCount: 0,
      files: [],
      createdAt: now - 6 * DAY,
    },
    {
      id: "fv_landing",
      project: "Landing Page",
      clientName: "Ahmed",
      clientEmail: "ahmed@example.com",
      amountCents: 30_000,
      uiStatus: "awaiting_payment",
      kind: "web",
      invitedAt: now - 3 * DAY,
      filesCount: 0,
      files: [],
      inviteCode: "VL-7K2Q-9XMD",
      createdAt: now - 4 * DAY,
    },
    {
      id: "fv_booking",
      project: "Booking Web App",
      clientName: "Ahmed",
      clientEmail: "ahmed@example.com",
      amountCents: 240_000,
      uiStatus: "audited",
      kind: "web",
      invitedAt: now - 13 * DAY,
      submittedAt: now - 5 * DAY,
      filesCount: 5,
      files: [
        file("booking-app.zip", 38_204_112),
        file("schema.sql", 41_200),
        file("notes.pdf", 812_004),
        file("screens.zip", 6_120_400),
        file("README.md", 3_880),
      ],
      manifestSha256: "c71d0f5e2ab9486317de40c8b2f19a70d6438ce10b7f295a4d18e6c0b3a95f21",
      inviteCode: "VL-8RT2-5XHN",
      createdAt: now - 14 * DAY,
    },
    {
      id: "fv_brand",
      project: "Brand Guide",
      clientName: "Lena",
      clientEmail: "lena@studio.example",
      amountCents: 9_000,
      uiStatus: "unlocked",
      kind: "design",
      invitedAt: now - 44 * DAY,
      submittedAt: now - 30 * DAY,
      filesCount: 2,
      files: [file("brand-guide.pdf", 12_400_220), file("palette.ase", 4_096)],
      manifestSha256: "4b8e1d70f3a25c96e8140bd7c26f9a31d58e7402c9b16fa3d075e8c14b92a6d0",
      inviteCode: "VL-6MW3-7PJT",
      payoutStatus: "paid",
      payoutPaypalId: PAYPAL("90245GH118320R"),
      createdAt: now - 45 * DAY,
    },
  ];

  events = [
    { id: "ev_10", ts: now - 2 * 3_600_000, type: "PAYOUT.SENT", vaultId: "fv_brand", label: "Payout sent to PayPal", amountCents: 8_034, paypalId: PAYPAL("90245GH118320R") },
    { id: "ev_09", ts: now - 9 * 3_600_000, type: "PAYOUT.FAILED", vaultId: "fv_icon", label: "PayPal could not deliver the payout", amountCents: 10_714, paypalId: PAYPAL("12345AB678901C") },
    { id: "ev_08", ts: now - 26 * 3_600_000, type: "PAYMENT.VOIDED", vaultId: "fv_landing", label: "Earlier hold voided, client re-invited", paypalId: PAYPAL("77120EF901774B") },
    { id: "ev_07", ts: now - 2 * DAY, type: "AUDIT.COMPLETED", vaultId: "fv_booking", label: "Audit finished, report ready", paypalId: PAYPAL("54017CD884039M") },
    { id: "ev_06", ts: now - 5 * DAY, type: "FILES.SUBMITTED", vaultId: "fv_booking", label: "Manifest locked and sent for review", paypalId: PAYPAL("54017CD884039M") },
    { id: "ev_05", ts: now - 8 * DAY, type: "FILES.UPLOADED", vaultId: "fv_logo", label: "4 files added to the vault", paypalId: PAYPAL("19304AB557210H") },
    { id: "ev_04", ts: now - 13 * DAY, type: "PAYMENT.AUTHORIZED", vaultId: "fv_booking", label: "Funds secured in escrow", amountCents: 240_000, paypalId: PAYPAL("54017CD884039M") },
    { id: "ev_03", ts: now - 18 * DAY, type: "PAYMENT.AUTHORIZED", vaultId: "fv_logo", label: "Funds secured in escrow", amountCents: 18_000, paypalId: PAYPAL("19304AB557210H") },
    { id: "ev_02", ts: now - 3 * DAY, type: "CLIENT.INVITED", vaultId: "fv_landing", label: "Invite sent to ahmed@example.com" },
    { id: "ev_01", ts: now - 6 * DAY, type: "VAULT.CREATED", vaultId: "fv_pitch", label: "Vault created" },
  ];
}

if (!hydrate()) {
  seed();
  persist();
}

/* ------------------------------------------------------------------ clock --- */

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** the spec's latency band */
const think = () => wait(LATENCY_MIN_MS + Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS));

/** the spec's 5%, only while the flag is on */
function maybeFail(): void {
  if (FX.mockErrors && Math.random() < MOCK_ERROR_RATE) {
    throw new FreelancerApiError("network", "The connection dropped. Try again.");
  }
}

function emit(type: FreelancerEventType, vaultId: string, label: string, extra: Partial<FreelancerEvent> = {}): FreelancerEvent {
  const event: FreelancerEvent = { id: uid("ev"), ts: Date.now(), type, vaultId, label, ...extra };
  events = [event, ...events];
  persist();
  listeners.forEach((cb) => cb(event));
  return event;
}

const find = (id: string): FreelancerVault => {
  const v = vaults.find((x) => x.id === id);
  if (!v) throw new FreelancerApiError("not_found", "Vault not found.");
  return v;
};

const replace = (next: FreelancerVault): FreelancerVault => {
  vaults = vaults.map((v) => (v.id === next.id ? next : v));
  persist();
  return next;
};

/* ------------------------------------------------------------- pure rules --- */

/** Why this file cannot be accepted, or null. */
export function scanProblem(f: FreelancerFile): string | null {
  const name = f.name.toLowerCase();
  if (!name.endsWith(ARCHIVE_LIMITS.acceptedExtension)) return "Only .zip archives are accepted.";
  if (f.sizeBytes > ARCHIVE_LIMITS.maxCompressedBytes) {
    return `Archives over ${Math.round(ARCHIVE_LIMITS.maxCompressedBytes / 1024 / 1024)} MB are rejected.`;
  }
  if (ARCHIVE_LIMITS.bombMarkers.some((m) => name.includes(m))) {
    return "This archive expands far beyond its size, so it was refused.";
  }
  if (ARCHIVE_LIMITS.blocked.some((ext) => name.endsWith(ext))) {
    return "Executable files are not allowed in a vault.";
  }
  return null;
}

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/** A staging URL has to be public https with no credentials in it. */
export function validateStagingUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Enter a staging URL." };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That does not look like a URL." };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "The URL must start with https://." };
  if (url.username || url.password) return { ok: false, reason: "Remove the username and password from the URL." };

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(host as (typeof BLOCKED_HOSTS)[number]) || host.endsWith(".localhost")) {
    return { ok: false, reason: "Local addresses cannot be audited." };
  }
  if (PRIVATE_IPV4.test(host)) return { ok: false, reason: "Private addresses cannot be audited." };
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "Private addresses cannot be audited." };
  }
  if (!host.includes(".")) return { ok: false, reason: "That host name is not public." };

  return { ok: true, url: url.toString() };
}

/** Deterministic 64-hex manifest from the file names and sizes. The UI labels
    it MOCK because the real hash comes from the backend, never from here. */
export function manifestHash(files: FreelancerFile[]): string {
  const material = files.map((f) => `${f.name}:${f.sizeBytes}`).join("|") || "empty";
  let h = 0x811c9dc5;
  for (let i = 0; i < material.length; i++) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let out = "";
  let state = h || 1;
  while (out.length < 64) {
    /* xorshift32, one 8-hex-char word at a time */
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    out += (state >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

export const inviteLink = (code: string) =>
  `${typeof location !== "undefined" ? location.origin : "https://vaultlance.ai"}/dashboard?join=${code}`;

export const phaseOfVault = (v: FreelancerVault): Phase =>
  phaseOf({
    uiStatus: v.uiStatus,
    invitedAt: v.invitedAt ?? null,
    submittedAt: v.submittedAt ?? null,
    filesCount: v.filesCount,
    payoutStatus: v.payoutStatus ?? null,
  });

/* ---------------------------------------------------------------- reads --- */

/** GET /api/me/summary */
export async function getFreelancerKpis(): Promise<FreelancerKpis> {
  await think();
  maybeFail();
  /* by phase, not by "has it ever been submitted": a paid vault keeps its
     submittedAt forever and must not sit in the review count */
  const phases = vaults.map(phaseOfVault);
  return {
    inEscrowCents: vaults
      .filter((v) => v.uiStatus === "held" || v.uiStatus === "audited")
      .reduce((sum, v) => sum + freelancerPayoutEstimate(v.amountCents), 0),
    inReview: phases.filter((p) => p === "submitted" || p === "in_review").length,
    paidOutCents: vaults
      .filter((v) => v.payoutStatus === "paid")
      .reduce((sum, v) => sum + freelancerPayoutEstimate(v.amountCents), 0),
  };
}

/** GET /api/vaults?as=freelancer — sorted by what needs the freelancer first */
export async function listFreelancerVaults(): Promise<FreelancerVault[]> {
  await think();
  maybeFail();
  const rows = vaults.map((v) => ({ vault: v, phase: phaseOfVault(v), createdAt: v.createdAt }));
  return sortByNeed(rows).map((row) => row.vault);
}

/** GET /api/events?as=freelancer */
export async function listFreelancerEvents(): Promise<FreelancerEvent[]> {
  await think();
  maybeFail();
  return [...events].sort((a, b) => b.ts - a.ts);
}

/* --------------------------------------------------------------- writes --- */

export interface CreateVaultInput {
  project: string;
  clientEmail: string;
  amountCents: number;
  kind: FreelancerVaultKind;
  description?: string;
}

/** POST /api/vaults */
export async function createVault(input: CreateVaultInput, opts: { draft?: boolean } = {}): Promise<FreelancerVault> {
  await think();
  maybeFail();

  const project = input.project.trim();
  if (project.length < 2) throw new FreelancerApiError("validation", "Give the vault a name of at least 2 characters.");
  if (project.length > 60) throw new FreelancerApiError("validation", "Keep the name under 60 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.clientEmail.trim())) {
    throw new FreelancerApiError("validation", "Enter a valid client email.");
  }
  if (input.amountCents > MAX_AMOUNT_CENTS) throw new FreelancerApiError("validation", "The most a vault can hold is $10,000.");
  if (!canCreateVault(input.amountCents)) {
    throw new FreelancerApiError("validation", `The minimum is $${MIN_AMOUNT_CENTS / 100}, and the fees must leave you something.`);
  }

  const now = Date.now();
  const vault: FreelancerVault = {
    id: uid("fv"),
    project,
    clientName: input.clientEmail.trim().split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    clientEmail: input.clientEmail.trim(),
    amountCents: input.amountCents,
    uiStatus: "awaiting_payment",
    kind: input.kind,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    filesCount: 0,
    files: [],
    createdAt: now,
  };

  vaults = [vault, ...vaults];
  emit("VAULT.CREATED", vault.id, "Vault created");
  persist();

  return opts.draft ? vault : inviteClient(vault.id);
}

/** PATCH /api/vaults/{id} */
export async function updateVault(id: string, patch: Partial<CreateVaultInput>): Promise<FreelancerVault> {
  await think();
  maybeFail();
  const v = find(id);
  if (v.uiStatus !== "awaiting_payment") {
    throw new FreelancerApiError("state", "A vault cannot be edited once it holds funds.");
  }
  if (patch.amountCents !== undefined && !canCreateVault(patch.amountCents)) {
    throw new FreelancerApiError("validation", "That amount cannot fund a vault.");
  }
  return replace({ ...v, ...patch });
}

/** DELETE /api/vaults/{id} — drafts only */
export async function deleteDraft(id: string): Promise<void> {
  await think();
  maybeFail();
  const v = find(id);
  if (phaseOfVault(v) !== "draft") throw new FreelancerApiError("state", "Only a draft can be deleted.");
  vaults = vaults.filter((x) => x.id !== id);
  persist();
}

export interface ScanCheck {
  step: ScanStep;
  state: "queued" | "running" | "pass" | "fail";
  reason?: string;
}

export interface ScanResult {
  ok: boolean;
  checks: ScanCheck[];
  manifestSha256?: string;
  reason?: string;
}

/** POST /api/uploads (multipart zip) — the four checks run in order, 382ms each */
export async function scanArchive(
  id: string,
  f: FreelancerFile,
  onProgress?: (checks: ScanCheck[]) => void
): Promise<ScanResult> {
  const problem = scanProblem(f);
  const checks: ScanCheck[] = SCAN_STEPS.map((step) => ({ step, state: "queued" }));

  for (let i = 0; i < checks.length; i++) {
    checks[i] = { ...checks[i], state: "running" };
    onProgress?.(checks.map((c) => ({ ...c })));
    await wait(382);

    /* the first check that can fail is the one that knows the reason */
    const step = checks[i].step;
    const failHere =
      (step === "Archive structure" && problem === "This archive expands far beyond its size, so it was refused.") ||
      (step === "File types" && problem === "Executable files are not allowed in a vault.") ||
      (step === "Size limits" &&
        (problem === "Only .zip archives are accepted." ||
          problem === "Archives over 100 MB are rejected."));

    if (problem && failHere) {
      checks[i] = { ...checks[i], state: "fail", reason: problem };
      onProgress?.(checks.map((c) => ({ ...c })));
      return { ok: false, checks, reason: problem };
    }

    checks[i] = { ...checks[i], state: "pass" };
    onProgress?.(checks.map((c) => ({ ...c })));
  }

  const v = find(id);
  const hash = manifestHash([...v.files, f]);
  replace({ ...v, files: [...v.files, f], filesCount: v.filesCount + 1 });
  emit("FILES.UPLOADED", id, `${f.name} added and hashed`);
  return { ok: true, checks, manifestSha256: hash };
}

/** POST /api/vaults/{id}/staging-url */
export async function addStagingUrl(id: string, url: string): Promise<FreelancerVault> {
  await think();
  maybeFail();
  const check = validateStagingUrl(url);
  if (!check.ok) throw new FreelancerApiError("validation", check.reason);
  const v = find(id);
  return replace({ ...v, stagingUrl: check.url });
}

/** POST /api/vaults/{id}/invite */
export async function inviteClient(id: string): Promise<FreelancerVault> {
  await think();
  maybeFail();
  const v = find(id);
  if (v.inviteCode) return v;
  const code = newInviteCode();
  registerInvite({
    code,
    project: v.project,
    freelancer: "Maya",
    amountCents: v.amountCents,
    clientEmail: v.clientEmail,
    vaultId: v.id,
  });
  const next = replace({ ...v, invitedAt: Date.now(), inviteCode: code });
  emit("CLIENT.INVITED", id, `Invite sent to ${v.clientEmail}`);
  return next;
}

/** POST /api/vaults/{id}/submit — locks the manifest and returns its hash */
export async function submitForReview(id: string): Promise<FreelancerVault> {
  await think();
  maybeFail();
  const v = find(id);
  if (v.uiStatus !== "held") throw new FreelancerApiError("state", "This vault is not holding funds yet.");
  if (!v.files.length && !v.stagingUrl) throw new FreelancerApiError("state", "Add your deliverables first.");
  const next = replace({
    ...v,
    submittedAt: Date.now(),
    manifestSha256: v.stagingUrl && !v.files.length ? manifestHash([{ name: v.stagingUrl, sizeBytes: 0 }]) : manifestHash(v.files),
  });
  emit("FILES.SUBMITTED", id, "Manifest locked and sent for review");
  return next;
}

/** POST /api/vaults/{id}/remind — once per 24h */
export async function remindClient(id: string): Promise<FreelancerVault> {
  await think();
  maybeFail();
  const v = find(id);
  const since = v.lastRemindedAt ?? 0;
  const left = 24 * 3_600_000 - (Date.now() - since);
  if (left > 0) {
    throw new FreelancerApiError("rate_limit", `You can remind again in ${Math.ceil(left / 3_600_000)}h.`);
  }
  return replace({ ...v, lastRemindedAt: Date.now() });
}

/** POST /api/vaults/{id}/payout/retry */
export async function retryPayout(id: string): Promise<FreelancerVault> {
  await think();
  maybeFail();
  const v = find(id);
  if (v.payoutStatus !== "failed") throw new FreelancerApiError("state", "There is no failed payout to retry.");
  const next = replace({
    ...v,
    payoutStatus: "paid",
    payoutPaypalId: v.payoutPaypalId ?? PAYPAL(`${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}R`),
  });
  emit("PAYOUT.SENT", id, "Payout sent to PayPal", {
    amountCents: freelancerPayoutEstimate(v.amountCents),
    paypalId: next.payoutPaypalId,
  });
  return next;
}

/** POST /api/vaults/{id}/duplicate */
export async function duplicateVault(id: string): Promise<FreelancerVault> {
  await think();
  maybeFail();
  const source = find(id);
  const copy: FreelancerVault = {
    id: uid("fv"),
    project: `${source.project} (copy)`,
    clientName: source.clientName,
    clientEmail: source.clientEmail,
    amountCents: source.amountCents,
    uiStatus: "awaiting_payment",
    kind: source.kind,
    ...(source.description ? { description: source.description } : {}),
    filesCount: 0,
    files: [],
    createdAt: Date.now(),
  };
  vaults = [copy, ...vaults];
  emit("VAULT.CREATED", copy.id, "Vault duplicated");
  persist();
  return copy;
}

/* ------------------------------------------------------------- realtime --- */

/** GET /api/events (SSE) */
export function subscribe(cb: (event: FreelancerEvent) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/* ------------------------------------------------- dev / client simulator --- */

/** Not an endpoint: fires what the client's side would do, so the freelancer
    dashboard can be walked without a second browser signed in. */
export async function simulateClientAuthorized(id: string): Promise<FreelancerVault> {
  await think();
  const v = find(id);
  const next = replace({ ...v, uiStatus: "held" });
  emit("PAYMENT.AUTHORIZED", id, "Funds secured in escrow", { amountCents: v.amountCents });
  return next;
}

export async function simulateAuditApproved(id: string): Promise<FreelancerVault> {
  await think();
  const v = find(id);
  const next = replace({ ...v, uiStatus: "unlocked", payoutStatus: "paid" });
  emit("AUDIT.COMPLETED", id, "Audit finished, report ready");
  emit("PAYMENT.CAPTURED", id, "Payment captured, funds released", { amountCents: v.amountCents });
  emit("PAYOUT.SENT", id, "Payout sent to PayPal", { amountCents: freelancerPayoutEstimate(v.amountCents) });
  return next;
}

export async function simulatePayoutFailed(id: string): Promise<FreelancerVault> {
  await think();
  const v = find(id);
  const next = replace({ ...v, uiStatus: "unlocked", payoutStatus: "failed" });
  emit("PAYOUT.FAILED", id, "PayPal could not deliver the payout", { amountCents: freelancerPayoutEstimate(v.amountCents) });
  return next;
}

/** Test seam: drop memory and storage back to the seed. */
export function resetMockStore(): void {
  listeners.clear();
  if (hasWindow()) {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
  }
  seed();
  persist();
}

/* kept for the drawer's live estimate without a round trip */
export { canCreateVault, freelancerPayoutEstimate };
