/* mockApi.ts — the freelancer's data, entirely local. Every function is shaped
   like the call it will become, and the endpoint it stands for is named above
   it, so swapping this module for apiClient is a change of import, not of call
   sites.

   Nothing here touches the client dashboard's store. The two surfaces share the
   invite registry and nothing else; that is deliberate, because the client's
   rows are the client's.

   Reads carry 300–618ms of latency and, behind FX.mockErrors, fail 5% of the
   time so the error and retry paths stay reachable. */

import { FX } from "../../config/fx";
import { freelancerPayoutEstimate } from "../../lib/fees";
import { phaseOf, type Phase, type PayoutStatus, type UiStatus } from "../../lib/freelancerPhase";
import { MOCK_ERROR_RATE, MOCK_LATENCY_MS, MOCK_PAYPAL_CAPTURE_PREFIX, REMIND_COOLDOWN_MS, SCAN_RULES } from "./mockConfig";
import { lookupInvite, registerInvite } from "./inviteRegistry";

/* ================================================================ types === */

export type VaultKind = "web" | "design" | "other";

export interface VaultFile {
  name: string;
  sizeBytes: number;
}

export interface FreelancerVault {
  id: string;
  project: string;
  clientName: string;
  clientEmail: string;
  amountCents: number;
  uiStatus: UiStatus;
  kind: VaultKind;
  description?: string;
  invitedAt?: number;
  submittedAt?: number;
  filesCount: number;
  files: VaultFile[];
  manifestSha256?: string;
  inviteCode?: string;
  payoutStatus?: PayoutStatus;
  payoutPaypalId?: string;
  captureId?: string;
  createdAt: number;
  remindedAt?: number;
  stagingUrl?: string;
  lastEventAt?: number;
}

export type FreelancerEventType =
  | "VAULT.CREATED"
  | "CLIENT.INVITED"
  | "PAYMENT.AUTHORIZED"
  | "FILES.SUBMITTED"
  | "AUDIT.COMPLETED"
  | "PAYMENT.CAPTURED"
  | "PAYOUT.SENT"
  | "PAYOUT.FAILED"
  | "PAYMENT.VOIDED"
  | "FILES.UPLOADED";

export interface FreelancerEvent {
  id: string;
  /** ISO timestamp, so a hydrated row is always a string the helper parses */
  at: string;
  type: FreelancerEventType;
  vaultId: string;
  vaultProject: string;
  /** net, where the event moves money */
  amountCents?: number;
  paypalId?: string;
  note?: string;
}

export interface FreelancerKpis {
  inEscrowCents: number;
  inReviewCount: number;
  paidOutCents: number;
}

/* ================================================================ store === */

const STORAGE_KEY = "vl.fd.store";

interface Store {
  vaults: FreelancerVault[];
  events: FreelancerEvent[];
}

let store: Store = { vaults: [], events: [] };
let hydrated = false;

const listeners = new Set<(e: FreelancerEvent) => void>();

function save(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* memory is enough for this tab */
  }
}

function load(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      seed();
      return;
    }
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || !Array.isArray(parsed.vaults)) {
      seed();
      return;
    }
    /* the previous build stored `ts`; a row without a parseable `at` is
       dropped rather than rendered as "NaNd ago" */
    const events = Array.isArray(parsed.events) ? parsed.events : [];
    store = {
      vaults: parsed.vaults,
      events: events
        .map((e) => (typeof e.at === "number" ? { ...e, at: new Date(e.at).toISOString() } : e))
        .filter((e) => e && typeof e.id === "string" && Number.isFinite(Date.parse(e.at))),
    };
  } catch {
    seed();
  }
}

/* ================================================================= seed === */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.now();

/** ISO timestamp `daysAgo` days before the seed ran. */
const iso = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();

const file = (name: string, kb: number): VaultFile => ({ name, sizeBytes: Math.round(kb * 1024) });

function seed(): void {
  const vaults: FreelancerVault[] = [
    {
      id: "v_0001",
      project: "Icon Set",
      clientName: "Ahmed",
      clientEmail: "ahmed@northlight.co",
      amountCents: 12_000,
      uiStatus: "unlocked",
      kind: "design",
      filesCount: 2,
      files: [file("icons.zip", 480), file("icons-preview.pdf", 120)],
      submittedAt: NOW - 6 * DAY,
      invitedAt: NOW - 9 * DAY,
      manifestSha256: manifestFor([file("icons.zip", 480), file("icons-preview.pdf", 120)]),
      payoutStatus: "failed",
      payoutPaypalId: "8XK12345AB678901C",
      createdAt: NOW - 9 * DAY,
      lastEventAt: NOW - 26 * HOUR,
    },
    {
      id: "v_0002",
      project: "Logo Pack",
      clientName: "Ahmed",
      clientEmail: "ahmed@northlight.co",
      amountCents: 18_000,
      uiStatus: "held",
      kind: "design",
      description: "Three lockups, monochrome and reversed.",
      filesCount: 4,
      files: [file("logo-primary.svg", 42), file("logo-mono.svg", 38), file("lockup.svg", 51), file("notes.md", 4)],
      invitedAt: NOW - 4 * DAY,
      createdAt: NOW - 4 * DAY,
      lastEventAt: NOW - 3 * DAY,
    },
    {
      id: "v_0003",
      project: "Pitch Deck",
      clientName: "Ahmed",
      clientEmail: "ahmed@northlight.co",
      amountCents: 45_000,
      uiStatus: "awaiting_payment",
      kind: "design",
      description: "18 slides, series A narrative.",
      filesCount: 0,
      files: [],
      createdAt: NOW - 2 * DAY,
      lastEventAt: NOW - 2 * DAY,
    },
    {
      id: "v_0004",
      project: "Landing Page",
      clientName: "Ahmed",
      clientEmail: "ahmed@northlight.co",
      amountCents: 30_000,
      uiStatus: "awaiting_payment",
      kind: "web",
      filesCount: 0,
      files: [],
      invitedAt: NOW - 1 * DAY,
      inviteCode: "VL-7K2Q-9XMD",
      createdAt: NOW - 1 * DAY,
      lastEventAt: NOW - 1 * DAY,
    },
    {
      id: "v_0005",
      project: "Booking Web App",
      clientName: "Ahmed",
      clientEmail: "ahmed@northlight.co",
      amountCents: 240_000,
      uiStatus: "audited",
      kind: "web",
      description: "Next.js booking flow with Stripe test mode.",
      filesCount: 5,
      files: [
        file("app.zip", 8_400),
        file("schema.sql", 22),
        file("readme.md", 9),
        file("env.example", 1),
        file("seed.zip", 1_200),
      ],
      submittedAt: NOW - 2 * DAY,
      invitedAt: NOW - 8 * DAY,
      manifestSha256: manifestFor([file("app.zip", 8_400), file("schema.sql", 22)]),
      createdAt: NOW - 8 * DAY,
      lastEventAt: NOW - 10 * HOUR,
    },
    {
      id: "v_0006",
      project: "Brand Guide",
      clientName: "Ahmed",
      clientEmail: "ahmed@northlight.co",
      amountCents: 9_000,
      uiStatus: "unlocked",
      kind: "design",
      filesCount: 1,
      files: [file("brand-guide.pdf", 2_100)],
      submittedAt: NOW - 12 * DAY,
      invitedAt: NOW - 15 * DAY,
      manifestSha256: manifestFor([file("brand-guide.pdf", 2_100)]),
      payoutStatus: "paid",
      payoutPaypalId: "8XK98765ZY432109D",
      createdAt: NOW - 15 * DAY,
      lastEventAt: NOW - 8.5 * DAY,
    },
  ];

  /* ten rows across the last nine days: the capture always precedes its payout */
  const events: FreelancerEvent[] = [
    ev("e_10", iso(26 / 24), "PAYOUT.FAILED", vaults[0], "PayPal rejected the payout", { paypalId: "8XK12345AB678901C" }),
    ev("e_09", iso(2), "PAYMENT.CAPTURED", vaults[0], "Capture completed", { amountCents: 10_200 }),
    ev("e_08", iso(10 / 24), "AUDIT.COMPLETED", vaults[4], "Client finished the audit"),
    ev("e_07", iso(2), "FILES.SUBMITTED", vaults[4], "Manifest locked and delivered"),
    ev("e_06", iso(8), "PAYMENT.AUTHORIZED", vaults[4], "Funds secured in escrow", { amountCents: 240_000 }),
    ev("e_05", iso(1), "CLIENT.INVITED", vaults[3], "Invite sent to the client"),
    ev("e_04", iso(2), "VAULT.CREATED", vaults[2], "Vault created as a draft"),
    ev("e_03", iso(8.5), "PAYOUT.SENT", vaults[5], "Payout sent to PayPal", { amountCents: 8_034, paypalId: "8XK98765ZY432109D" }),
    ev("e_02", iso(9), "PAYMENT.CAPTURED", vaults[5], "Capture completed", { amountCents: 9_000 }),
    ev("e_01", iso(3), "PAYMENT.VOIDED", { ...vaults[1], project: "Old Retainer" }, "Hold voided by the client"),
  ];

  store = { vaults, events };
  save();
}

function ev(
  id: string,
  at: string,
  type: FreelancerEventType,
  vault: Pick<FreelancerVault, "id" | "project">,
  note: string,
  extra: { amountCents?: number; paypalId?: string } = {}
): FreelancerEvent {
  return {
    id,
    at,
    type,
    vaultId: vault.id,
    vaultProject: vault.project,
    note,
    ...extra,
  };
}

/* ============================================================= helpers === */

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How many upcoming reads the dev panel has asked to fail. */
let forcedErrors = 0;

/** Shift+D → "Force error": the next read fails, so the banner is reachable
    without a dice roll. Nothing else can produce a failure any more. */
export function forceMockError(): void {
  forcedErrors = 1;
}

/** 300–618ms, plus a failure only when the dev panel asked for one. */
async function latency(): Promise<void> {
  const span = MOCK_LATENCY_MS.max - MOCK_LATENCY_MS.min;
  await wait(MOCK_LATENCY_MS.min + Math.round(Math.random() * span));
  if (forcedErrors > 0) {
    forcedErrors -= 1;
    throw new Error("The vault service didn’t answer. Try again.");
  }
  if (FX.mockErrors && Math.random() < MOCK_ERROR_RATE) {
    throw new Error("The vault service didn’t answer. Try again.");
  }
}

const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function find(id: string): FreelancerVault {
  load();
  const v = store.vaults.find((x) => x.id === id);
  if (!v) throw new Error("That vault isn’t here any more.");
  return v;
}

function emit(type: FreelancerEventType, vault: FreelancerVault, note: string, extra: { amountCents?: number; paypalId?: string } = {}): void {
  const e: FreelancerEvent = {
    id: uid("e"),
    at: new Date().toISOString(),
    type,
    vaultId: vault.id,
    vaultProject: vault.project,
    note,
    ...extra,
  };
  store.events = [e, ...store.events].slice(0, 200);
  vault.lastEventAt = Date.parse(e.at);
  save();
  for (const cb of listeners) cb(e);
}

/**
 * A deterministic 64-hex digest of the file names and sizes. This is NOT
 * SHA-256 — it is a stand-in with the right shape, and every place it surfaces
 * is labelled MOCK.
 */
export function manifestFor(files: VaultFile[]): string {
  const material = files.map((f) => `${f.name}:${f.sizeBytes}`).sort().join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let i = 0; i < material.length; i++) {
    const c = material.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 3) | (c >>> 5)), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ ((c << 7) | (c >>> 1)), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ ((c << 11) | (c >>> 3)), 0x27d4eb2f) >>> 0;
  }
  return [h1, h2, h3, h4]
    .map((h) => h.toString(16).padStart(8, "0"))
    .join("")
    .repeat(2)
    .slice(0, 64);
}

/** Format a code the way the registry does. */
export const normalizeCode = (code: string) => code.trim().toUpperCase();

/* ============================================================ read APIs === */

/** GET /api/me/summary */
export async function getFreelancerKpis(): Promise<FreelancerKpis> {
  await latency();
  load();
  let inEscrowCents = 0;
  let paidOutCents = 0;
  let inReviewCount = 0;
  for (const v of store.vaults) {
    const phase = phaseOf(v);
    if (phase === "funded" || phase === "submitted" || phase === "in_review") {
      inEscrowCents += freelancerPayoutEstimate(v.amountCents);
    }
    if (phase === "in_review" || phase === "submitted") inReviewCount++;
    if (phase === "paid") paidOutCents += freelancerPayoutEstimate(v.amountCents);
  }
  return { inEscrowCents, inReviewCount, paidOutCents };
}

/** GET /api/vaults?as=freelancer */
export async function listFreelancerVaults(): Promise<FreelancerVault[]> {
  await latency();
  load();
  return store.vaults.map((v) => ({ ...v, files: [...v.files] }));
}

/** GET /api/events?as=freelancer */
export async function listFreelancerEvents(): Promise<FreelancerEvent[]> {
  await latency();
  load();
  return [...store.events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/* =========================================================== mutations === */

export interface CreateVaultInput {
  project: string;
  clientEmail: string;
  amountCents: number;
  kind: VaultKind;
  description?: string;
  files?: VaultFile[];
  stagingUrl?: string;
  manifestSha256?: string;
}

/** POST /api/vaults */
export async function createVault(input: CreateVaultInput, opts: { draft: boolean }): Promise<FreelancerVault> {
  await latency();
  load();
  const files = input.files ?? [];
  const vault: FreelancerVault = {
    id: uid("v"),
    project: input.project.trim(),
    clientName: input.clientEmail.split("@")[0] || "Client",
    clientEmail: input.clientEmail.trim(),
    amountCents: input.amountCents,
    uiStatus: "awaiting_payment",
    kind: input.kind,
    ...(input.description ? { description: input.description } : {}),
    filesCount: files.length,
    files,
    ...(input.stagingUrl ? { stagingUrl: input.stagingUrl } : {}),
    ...(input.manifestSha256 ? { manifestSha256: input.manifestSha256 } : {}),
    createdAt: Date.now(),
  };

  if (!opts.draft) {
    const invite = registerInvite({
      vaultId: vault.id,
      project: vault.project,
      clientEmail: vault.clientEmail,
      amountCents: vault.amountCents,
      createdAt: Date.now(),
    });
    vault.invitedAt = Date.now();
    vault.inviteCode = invite.code;
  }

  store.vaults = [vault, ...store.vaults];
  emit("VAULT.CREATED", vault, opts.draft ? "Saved as a draft" : "Vault created");
  if (!opts.draft) emit("CLIENT.INVITED", vault, "Invite sent to the client");
  save();
  return { ...vault };
}

/** PATCH /api/vaults/{id} */
export async function updateVault(id: string, patch: Partial<FreelancerVault>): Promise<FreelancerVault> {
  await latency();
  const v = find(id);
  Object.assign(v, patch);
  if (patch.files) v.filesCount = patch.files.length;
  save();
  return { ...v };
}

/** DELETE /api/vaults/{id} */
export async function deleteDraft(id: string): Promise<void> {
  await latency();
  const v = find(id);
  if (v.invitedAt || v.uiStatus !== "awaiting_payment") {
    throw new Error("Only a draft can be deleted.");
  }
  store.vaults = store.vaults.filter((x) => x.id !== id);
  save();
}

/* ============================================================== uploads === */

export type ScanStepId = "structure" | "types" | "size" | "hash";
export type ScanStepState = "queued" | "running" | "pass" | "fail";

export interface ScanStep {
  id: ScanStepId;
  label: string;
  state: ScanStepState;
  reason?: string;
}

export interface ScanResult {
  ok: boolean;
  steps: ScanStep[];
  files: VaultFile[];
  manifestSha256?: string;
  totalBytes: number;
}

const STEP_LABELS: Record<ScanStepId, string> = {
  structure: "Archive structure",
  types: "File types",
  size: "Size limits",
  hash: "Manifest hash",
};

/** Why a name is refused, or null. The one place the naming rules live. */
export function archiveProblem(name: string, sizeBytes: number): string | null {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".zip")) return "Only .zip archives are accepted.";
  if (sizeBytes > SCAN_RULES.maxCompressedBytes) return "That archive is over the 100 MB limit.";
  if (SCAN_RULES.forbiddenNameFragments.some((f) => lower.includes(f))) {
    return "That archive failed the scan: its name is on the blocked list.";
  }
  if (SCAN_RULES.forbiddenExtensions.some((e) => lower.endsWith(e))) {
    return "That file type isn’t accepted.";
  }
  return null;
}

/**
 * POST /api/uploads (zip)
 * Runs the four checks in order, emitting each state change so the drawer can
 * animate them. A .zip that passes becomes the vault's deliverable.
 */
export async function scanArchive(
  id: string,
  file: File,
  onProgress?: (steps: ScanStep[]) => void
): Promise<ScanResult> {
  const steps: ScanStep[] = (Object.keys(STEP_LABELS) as ScanStepId[]).map((sid) => ({
    id: sid,
    label: STEP_LABELS[sid],
    state: "queued",
  }));

  const publish = () => onProgress?.(steps.map((s) => ({ ...s })));
  const run = async (sid: ScanStepId, verdict: string | null) => {
    const step = steps.find((s) => s.id === sid)!;
    step.state = "running";
    publish();
    await wait(382);
    step.state = verdict ? "fail" : "pass";
    if (verdict) step.reason = verdict;
    publish();
  };

  const nameProblem = archiveProblem(file.name, file.size);
  const bomb = SCAN_RULES.forbiddenNameFragments.some((f) => file.name.toLowerCase().includes(f));

  await run("structure", bomb ? "Archive rejected: it expands past the 100:1 ratio limit." : null);
  await run("types", nameProblem && !bomb ? nameProblem : null);
  await run("size", file.size > SCAN_RULES.maxCompressedBytes ? "Over the 100 MB compressed limit." : null);

  const failed = steps.some((s) => s.state === "fail");
  const files: VaultFile[] = failed ? [] : [{ name: file.name, sizeBytes: file.size }];
  const manifest = failed ? undefined : manifestFor(files);

  await run("hash", failed ? "No manifest: the archive did not pass." : null);

  if (failed) {
    return { ok: false, steps, files: [], totalBytes: file.size };
  }

  const v = find(id);
  v.files = [...v.files, ...files];
  v.filesCount = v.files.length;
  v.manifestSha256 = manifest;
  save();
  emit("FILES.UPLOADED", v, `${file.name} scanned and added`);

  return { ok: true, steps, files, totalBytes: file.size, manifestSha256: manifest };
}

/** POST /api/vaults/{id}/staging-url */
export async function addStagingUrl(id: string, url: string): Promise<{ respondedInMs: number }> {
  await latency();
  const v = find(id);
  v.stagingUrl = url;
  save();
  return { respondedInMs: 412 };
}

export type UrlProblem = "not_https" | "localhost" | "private" | "credentials" | "malformed";

/** The staging URL rules, as data, so the drawer and the form agree. */
export function stagingUrlProblem(raw: string): UrlProblem | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "malformed";
  }
  if (url.protocol !== "https:") return "not_https";
  if (url.username || url.password) return "credentials";
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return "localhost";
  if (host === "127.0.0.1" || host === "::1" || host === "[::1]") return "localhost";
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return "private";
    if (a === 192 && b === 168) return "private";
    if (a === 172 && b >= 16 && b <= 31) return "private";
    if (a === 127) return "localhost";
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) return "private";
  return null;
}

export const URL_PROBLEM_TEXT: Record<UrlProblem, string> = {
  not_https: "Use an https:// address.",
  localhost: "Localhost isn’t reachable by your client.",
  private: "Private network addresses aren’t reachable by your client.",
  credentials: "Remove the username and password from the URL.",
  malformed: "That doesn’t look like a URL.",
};

/* =========================================================== lifecycle === */

/** POST /api/vaults/{id}/invite -> { inviteCode } */
export async function inviteClient(id: string): Promise<{ inviteCode: string }> {
  await latency();
  const v = find(id);
  if (v.inviteCode) return { inviteCode: v.inviteCode };
  const invite = registerInvite({
    vaultId: v.id,
    project: v.project,
    clientEmail: v.clientEmail,
    amountCents: v.amountCents,
    createdAt: Date.now(),
  });
  v.invitedAt = Date.now();
  v.inviteCode = invite.code;
  save();
  emit("CLIENT.INVITED", v, "Invite sent to the client");
  return { inviteCode: invite.code };
}

/** POST /api/vaults/{id}/submit — locks the manifest */
export async function submitForReview(id: string): Promise<{ manifestSha256: string }> {
  await latency();
  const v = find(id);
  if (v.filesCount === 0) throw new Error("Add a deliverable before submitting.");
  const manifest = v.manifestSha256 ?? manifestFor(v.files);
  v.manifestSha256 = manifest;
  v.submittedAt = Date.now();
  v.payoutStatus = "pending";
  save();
  emit("FILES.SUBMITTED", v, "Manifest locked and delivered");
  return { manifestSha256: manifest };
}

/** POST /api/vaults/{id}/remind — once per 24h */
export async function remindClient(id: string): Promise<{ nextAt: number }> {
  await latency();
  const v = find(id);
  const now = Date.now();
  if (v.remindedAt && now - v.remindedAt < REMIND_COOLDOWN_MS) {
    throw new Error("You already reminded this client today.");
  }
  v.remindedAt = now;
  save();
  return { nextAt: now + REMIND_COOLDOWN_MS };
}

export const remindRemainingMs = (v: Pick<FreelancerVault, "remindedAt">): number => {
  if (!v.remindedAt) return 0;
  return Math.max(0, v.remindedAt + REMIND_COOLDOWN_MS - Date.now());
};

/** POST /api/vaults/{id}/payout/retry */
export async function retryPayout(id: string): Promise<FreelancerVault> {
  await latency();
  const v = find(id);
  if (v.payoutStatus !== "failed") throw new Error("This payout isn’t failed.");
  v.payoutStatus = "paid";
  v.payoutPaypalId = `${MOCK_PAYPAL_CAPTURE_PREFIX}${Math.random().toString(36).slice(2, 10).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}C`;
  save();
  emit("PAYOUT.SENT", v, "Payout sent on the retry", { amountCents: freelancerPayoutEstimate(v.amountCents), paypalId: v.payoutPaypalId });
  return { ...v };
}

/** POST /api/vaults/{id}/duplicate */
export async function duplicateVault(id: string): Promise<FreelancerVault> {
  await latency();
  const source = find(id);
  const copy: FreelancerVault = {
    ...source,
    id: uid("v"),
    project: `${source.project} (copy)`,
    uiStatus: "awaiting_payment",
    filesCount: 0,
    files: [],
    createdAt: Date.now(),
    invitedAt: undefined,
    submittedAt: undefined,
    manifestSha256: undefined,
    inviteCode: undefined,
    payoutStatus: undefined,
    payoutPaypalId: undefined,
    captureId: undefined,
    remindedAt: undefined,
  };
  store.vaults = [copy, ...store.vaults];
  emit("VAULT.CREATED", copy, "Duplicated from an earlier vault");
  save();
  return { ...copy };
}

/* ============================================================ realtime === */

/** GET /api/events (server-sent events) */
export function subscribe(cb: (event: FreelancerEvent) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/* ====================================================== dev simulators === */

/** A dev switch for the payout banner: seed has an email, this takes it away. */
let paypalOn = true;
export const hasPaypalEmail = () => paypalOn;
export function setHasPaypalEmail(on: boolean): void {
  paypalOn = on;
}

/** The client authorizes the hold. */
export async function simulateClientAuthorized(id: string): Promise<void> {
  const v = find(id);
  if (v.uiStatus !== "awaiting_payment") return;
  v.invitedAt = v.invitedAt ?? Date.now();
  v.uiStatus = "held";
  save();
  emit("PAYMENT.AUTHORIZED", v, "Funds secured in escrow", { amountCents: v.amountCents });
}

/** The client finishes the audit; the payout is then pending. */
export async function simulateAuditApproved(id: string): Promise<void> {
  const v = find(id);
  if (v.uiStatus !== "held") return;
  v.uiStatus = "audited";
  v.payoutStatus = "pending";
  save();
  emit("AUDIT.COMPLETED", v, "Client finished the audit");
}

/** The capture lands and the payout is marked paid. */
export async function simulatePayoutSent(id: string): Promise<void> {
  const v = find(id);
  v.uiStatus = "unlocked";
  v.payoutStatus = "paid";
  v.payoutPaypalId = v.payoutPaypalId ?? `${MOCK_PAYPAL_CAPTURE_PREFIX}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  save();
  emit("PAYMENT.CAPTURED", v, "Capture completed", { amountCents: v.amountCents });
  emit("PAYOUT.SENT", v, "Payout sent to PayPal", { amountCents: freelancerPayoutEstimate(v.amountCents), paypalId: v.payoutPaypalId });
}

/** PayPal rejects the payout. */
export async function simulatePayoutFailed(id: string): Promise<void> {
  const v = find(id);
  v.uiStatus = "unlocked";
  v.payoutStatus = "failed";
  save();
  emit("PAYOUT.FAILED", v, "PayPal rejected the payout");
}

/** The client changes their mind before delivery. */
export async function simulateVoided(id: string): Promise<void> {
  const v = find(id);
  v.uiStatus = "voided";
  save();
  emit("PAYMENT.VOIDED", v, "Hold voided by the client");
}

/* ============================================================= selectors = */

export const phaseOfVault = (v: FreelancerVault): Phase => phaseOf(v);

export function needsAttention(v: FreelancerVault): boolean {
  const phase = phaseOfVault(v);
  return phase === "payout_failed" || phase === "funded" || phase === "draft" || phase === "invited";
}

export function inviteFor(v: FreelancerVault): string | null {
  if (v.inviteCode) return v.inviteCode;
  const found = [...(lookupInvite(v.inviteCode ?? "") ? [v.inviteCode!] : [])];
  return found[0] ?? null;
}

/** Test and dev helper: wipe the store so the next read reseeds. */
export function resetFreelancerData(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
  hydrated = false;
  load();
}
