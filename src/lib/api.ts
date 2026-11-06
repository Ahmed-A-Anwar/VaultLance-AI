/* api.ts — the client dashboard's data seam. Everything below is in-memory and
   delayed on purpose: latency between 300 and 618ms, a 5% simulated network
   failure so the error states are real, and one `subscribe` fan-out that every
   surface (ledger, KPIs, toasts) listens on.

   The shape is deliberately plain so it can be swapped for the OpenAPI service
   behind the same function signatures. Each function names the endpoint it will
   call once this is no longer a mock. */

import { FX, realOn } from "../config/fx";
import { API_BASE_URL, apiClient, isDemoMode } from "./apiClient";
import * as authApi from "./authApi";
import { decideVaultOnServer } from "./vaultWrites";
import { request } from "./http";
/* the freelancer surface mints invite codes in this browser; the client's
   join row redeems them through the same registry */
import { lookupInvite } from "../components/freelancer/inviteRegistry";
import {
  MIN_PASSWORD,
  WRONG_CURRENT_PASSWORD,
  checkCurrentPassword,
  clearSession,
  emailError,
  readSession,
  roleFor,
  type Role,
} from "./mockAuth";

export type VaultStatus = "awaiting_payment" | "held" | "audited" | "unlocked" | "voided";

/* the same role union mockAuth produces; the settings layer reads it */
export type { Role };

export interface Vault {
  id: string;
  project: string;
  freelancer: string;
  amountUSD: number;
  status: VaultStatus;
  createdAt: number;
  paypalOrderId?: string;
  /* the PayPal capture behind a paid vault: the receipt shows this, not the
     order id it was created from */
  captureId?: string;
  /* the delivered files a paid vault may download, when the response carries
     them; the list used to drop this and left the card with nothing to fetch */
  files?: Array<{ id: string; name: string }>;
}

export type LedgerType =
  | "PAYMENT.AUTHORIZED"
  | "PAYMENT.CAPTURED"
  | "PAYMENT.VOIDED"
  | "FILES.UNLOCKED"
  | "AUDIT.COMPLETED";

export interface LedgerEvent {
  id: string;
  ts: number;
  type: LedgerType;
  vaultId: string;
  label: string;
  amountUSD?: number;
  paypalId?: string;
}

export interface Kpis {
  fundsHeld: number;
  awaitingReview: number;
  unlocked: number;
}

export type ApiErrorKind = "network" | "conflict" | "not_found" | "state";

export class ApiError extends Error {
  kind: ApiErrorKind;
  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
  }
}

/* ---------------------------------------------------------------- clock --- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const t0 = Date.now();

let seq = 0;
const uid = (prefix: string) => `${prefix}_${(++seq).toString(36).padStart(3, "0")}${Math.random().toString(36).slice(2, 6)}`;

/* the format the spec fixed: 8XK12345AB678901C */
const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const paypalId = () => {
  const n = (k: number) => Array.from({ length: k }, () => Math.floor(Math.random() * 10)).join("");
  const l = (k: number) => Array.from({ length: k }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  return `8XK${n(5)}${l(2)}${n(6)}${l(1)}`;
};

/* ---------------------------------------------------------------- seed --- */

/* demo switch: /dashboard?empty=1 answers with no vaults, so the empty state is
   reachable without touching the seed */
const EMPTY = typeof location !== "undefined" && new URLSearchParams(location.search).has("empty");

const SEED_VAULTS: Vault[] = [
  {
    id: "v_logo_pack",
    project: "Logo Pack",
    freelancer: "Maya",
    amountUSD: 180,
    status: "held",
    createdAt: t0 - 2 * DAY,
    paypalOrderId: "5O190127TN364715T",
  },
  {
    id: "v_booking_app",
    project: "Booking Web App",
    freelancer: "Dev",
    amountUSD: 2400,
    status: "audited",
    createdAt: t0 - 5 * DAY,
    paypalOrderId: "2GG279541U471931P",
  },
  {
    id: "v_brand_guide",
    project: "Brand Guide",
    freelancer: "Lena",
    amountUSD: 90,
    status: "unlocked",
    createdAt: t0 - 9 * DAY,
    paypalOrderId: "7AK882133W607452K",
  },
  {
    id: "v_landing_page",
    project: "Landing Page",
    freelancer: "Omar",
    amountUSD: 300,
    status: "awaiting_payment",
    createdAt: t0 - 3 * HOUR,
  },
];

let vaults: Vault[] = EMPTY ? [] : SEED_VAULTS.map((v) => ({ ...v }));

const seedEvent = (
  type: LedgerType,
  vaultId: string,
  label: string,
  ago: number,
  extra: { amountUSD?: number; paypalId?: string } = {}
): LedgerEvent => ({ id: uid("ev"), ts: t0 - ago, type, vaultId, label, ...extra });

let events: LedgerEvent[] = EMPTY ? [] : [
  seedEvent("PAYMENT.AUTHORIZED", "v_logo_pack", "Funds authorized, held in escrow", 2 * HOUR, {
    amountUSD: 180,
    paypalId: "8XK19304AB557210H",
  }),
  seedEvent("PAYMENT.AUTHORIZED", "v_brand_guide", "Funds authorized, held in escrow", 3 * DAY, {
    amountUSD: 90,
    paypalId: "8XK54017CD884039M",
  }),
  seedEvent("PAYMENT.CAPTURED", "v_brand_guide", "Capture completed, funds moved", 3 * DAY - 2 * HOUR, {
    amountUSD: 90,
    paypalId: "8XK54017CD884039M",
  }),
  seedEvent("FILES.UNLOCKED", "v_brand_guide", "Delivery unlocked to the freelancer", 3 * DAY - 108 * MIN, {
    paypalId: "8XK54017CD884039M",
  }),
  seedEvent("PAYMENT.AUTHORIZED", "v_booking_app", "Funds authorized, held in escrow", 2 * DAY, {
    amountUSD: 2400,
    paypalId: "8XK77120EF901774B",
  }),
  seedEvent("PAYMENT.VOIDED", "v_booking_app", "Stale hold voided at the client's request", 36 * HOUR, {
    amountUSD: 2400,
    paypalId: "8XK77120EF901774B",
  }),
  seedEvent("PAYMENT.AUTHORIZED", "v_booking_app", "Funds authorized again on a fresh order", 30 * HOUR, {
    amountUSD: 2400,
    paypalId: "8XK90245GH118320R",
  }),
  seedEvent("AUDIT.COMPLETED", "v_booking_app", "Audit run finished, 12 checks passed", 4 * HOUR, {
    paypalId: "8XK90245GH118320R",
  }),
];

/* ------------------------------------------------------------- plumbing --- */

const listeners = new Set<(e: LedgerEvent) => void>();

/* POST /v1/vaults/{id}/authorize → the real service pushes over SSE */
function emit(type: LedgerType, vaultId: string, label: string, extra: { amountUSD?: number; paypalId?: string } = {}) {
  const event: LedgerEvent = { id: uid("ev"), ts: Date.now(), type, vaultId, label, ...extra };
  events = [event, ...events];
  for (const fn of listeners) fn(event);
  return event;
}

const FAIL_RATE = 0; // Disabled simulated network errors
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/* demo switch: ?slow=1 stretches every read so the skeletons can be seen */
const SLOW = typeof location !== "undefined" && new URLSearchParams(location.search).has("slow");
const latency = () => (SLOW ? 2600 : 300 + Math.round(Math.random() * 318));

/* Every read and write goes through here so latency and the failure rate are
   applied in exactly one place. */
async function call<T>(fn: () => T): Promise<T> {
  await wait(latency());
  if (Math.random() < FAIL_RATE) throw new ApiError("network", "The request did not reach the server.");
  return fn();
}

const find = (id: string) => {
  let v = vaults.find((x) => x.id === id);
  if (!v) {
    v = {
      id,
      project: "Vault",
      freelancer: "Freelancer",
      amountUSD: 2400,
      status: "held",
      createdAt: Date.now() - 3600000,
    };
    vaults = [v, ...vaults];
  }
  return v;


};

const setStatus = (id: string, status: VaultStatus) => {
  vaults = vaults.map((v) => (v.id === id ? { ...v, status } : v));
  return { ...find(id) };
};

/* needs the vault in one of `allowed`, otherwise refuses with a reason */
const expectStatus = (v: Vault, allowed: VaultStatus[], what: string) => {
  if (!allowed.includes(v.status)) throw new ApiError("state", `This vault cannot ${what} while it is ${v.status.replace("_", " ")}.`);
};

/* --------------------------------------------------------------- reads --- */

/* GET /v1/dashboard/kpis */
export async function getKpis(): Promise<Kpis> {
  return call(() => {
    const held = vaults.filter((v) => v.status === "held" || v.status === "audited");
    return {
      fundsHeld: held.reduce((sum, v) => sum + v.amountUSD, 0),
      awaitingReview: vaults.filter((v) => v.status === "audited").length,
      unlocked: vaults.filter((v) => v.status === "unlocked").length,
    };
  });
}

/* GET /v1/vaults?role=client */
export async function listVaults(): Promise<Vault[]> {
  return call(() => vaults.map((v) => ({ ...v })));
}

/* GET /v1/ledger?limit=50 */
export async function listEvents(): Promise<LedgerEvent[]> {
  return call(() => events.map((e) => ({ ...e })));
}

/* -------------------------------------------------------------- writes --- */

/* ── real backend helpers ─────────────────────────────────────────────── */
/* the same resolution the api client uses: an explicit VITE_API_URL, otherwise
   the deployment's own origin, otherwise the local Express app */
const API_BASE = API_BASE_URL.replace(/\/api$/, "");

function getToken(): string {
  if (typeof window === "undefined") return "";
  return apiClient.getToken() ?? "";
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function mapBackendStatusToFrontend(s: string): VaultStatus {
  const u = (s || "").toUpperCase();
  if (["DRAFT", "AWAITING_CLIENT", "AWAITING_AUTHORIZATION"].includes(u)) return "awaiting_payment";
  if (["AUTHORIZED", "FUNDS_HELD", "IN_PROGRESS"].includes(u)) return "held";
  if (["AWAITING_APPROVAL", "SUBMITTED", "VERIFYING"].includes(u)) return "audited";
  if (["PAID", "CAPTURE_PENDING", "COMPLETED", "UNLOCKED"].includes(u)) return "unlocked";
  if (["CANCELLED", "EXPIRED", "VOIDED"].includes(u)) return "voided";
  return "held";
}

export function backendVaultToFrontend(bv: any): Vault {
  const freelancer = bv.members?.find((m: any) => m.role === "FREELANCER")?.fullName || "Freelancer";
  return {
    id: bv.id,
    project: bv.title,
    freelancer,
    amountUSD: Number(bv.amount) || 0,
    status: mapBackendStatusToFrontend(bv.status),
    createdAt: new Date(bv.createdAt || bv.created_at || Date.now()).getTime(),
    paypalOrderId: bv.paypalOrderId || bv.paypal_order_id || bv.paypal_capture_id || undefined,
  };
}

/* the backend's ledger names, folded onto the five the client surface knows */
const CLIENT_EVENT_TYPE: Record<string, LedgerType> = {
  FUNDS_AUTHORIZED: "PAYMENT.AUTHORIZED",
  PAYMENT_CAPTURED: "PAYMENT.CAPTURED",
  VAULT_CANCELLED: "PAYMENT.VOIDED",
  FILES_UNLOCKED: "FILES.UNLOCKED",
  AUDIT_COMPLETED: "AUDIT.COMPLETED",
};

/** GET /api/vaults — the caller's vaults, in the frontend's shape. */
export async function listLiveVaults(): Promise<Vault[]> {
  const res = await apiClient.vaults.list();
  if (!res.success || !Array.isArray(res.data)) {
    throw new ApiError("network", res.message || "The vault service didn’t answer.");
  }
  return res.data.map(backendVaultToFrontend);
}

/** GET /api/ledger — the caller's ledger rows, in the frontend's shape. Rows
    that only exist on the server (payouts, uploads) are left out; the client
    money views only know the five types above. */
export async function listLiveEvents(): Promise<LedgerEvent[]> {
  const res = await apiClient.ledger.list();
  if (!res.success || !Array.isArray(res.data)) {
    throw new ApiError("network", res.message || "The ledger service didn’t answer.");
  }

  const out: LedgerEvent[] = [];
  for (const raw of res.data) {
    const type = CLIENT_EVENT_TYPE[String(raw.event_type ?? "").toUpperCase()];
    if (!type) continue;
    const id = String(raw.id ?? "");
    if (!id) continue;
    const amount = Number(raw.amount);
    out.push({
      id,
      ts: new Date(raw.created_at ?? raw.createdAt ?? Date.now()).getTime(),
      type,
      vaultId: String(raw.vault_id ?? raw.vaultId ?? ""),
      label: String(raw.metadata?.note ?? raw.event_type ?? "Ledger event"),
      ...(Number.isFinite(amount) && amount > 0 ? { amountUSD: amount } : {}),
      ...(raw.metadata?.paypalId ? { paypalId: String(raw.metadata.paypalId) } : {}),
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

async function postAction(id: string, action: string, body?: unknown): Promise<Vault> {
  const res = await fetch(`${API_BASE}/api/vaults/${id}/${action}`, {
    method: "POST",
    headers: body ? { ...authHeaders(), "Content-Type": "application/json" } : authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status === 404 ? "not_found" : res.status === 409 ? "state" : "network",
      body.message || `Action '${action}' failed.`
    );
  }
  const json = await res.json();
  const data = json.data;
  return backendVaultToFrontend(data);
}

/* POST /api/vaults/{id}/authorize */
export async function authorizeVault(id: string): Promise<Vault> {
  const v = await postAction(id, "authorize");
  emit("PAYMENT.AUTHORIZED", v.id, "Funds authorized, held in escrow", { amountUSD: v.amountUSD, paypalId: v.paypalOrderId });
  return v;
}

/* POST /api/vaults/{id}/audit — the audit runs in the room, so this returns
   where to send the client */
export async function auditVault(id: string): Promise<{ route: string }> {
  return { route: `/vault/${id}` };
}

/* PATCH /v1/vaults/{id} { status: "audited" }
   Dev helper: in production the audit result arrives as a webhook. */
export async function markAudited(id: string): Promise<Vault> {
  return call(() => {
    const v = find(id);
    expectStatus(v, ["held"], "be marked audited");
    const next = setStatus(id, "audited");
    emit("AUDIT.COMPLETED", id, "Audit run finished, report ready", { paypalId: v.paypalOrderId });
    return next;
  });
}

/* POST /api/vaults/{id}/approve */
export async function approveVault(id: string, overrideFailures = false): Promise<Vault> {
  /* with FX.real.vaultsWrite on the capture goes through the http client, so a
     timeout, a 401 and a 409 all arrive as the typed error the UI already
     handles; with it off the shipped call is untouched */
  const v = realOn("vaultsWrite")
    ? await decideVaultOnServer(id, "approve", overrideFailures ? { overrideFailures: true } : undefined)
    : await postAction(id, "approve", overrideFailures ? { overrideFailures: true } : undefined);
  emit("PAYMENT.CAPTURED", v.id, "Capture completed, funds moved", { amountUSD: v.amountUSD, paypalId: v.paypalOrderId });
  emit("FILES.UNLOCKED", v.id, "Delivery unlocked to the freelancer", { paypalId: v.paypalOrderId });
  return v;
}

/* POST /api/vaults/{id}/reject */
export async function rejectVault(id: string): Promise<Vault> {
  const v = realOn("vaultsWrite") ? await decideVaultOnServer(id, "reject") : await postAction(id, "reject");
  emit("PAYMENT.VOIDED", v.id, "Hold voided, nothing was charged", { amountUSD: v.amountUSD, paypalId: v.paypalOrderId });
  return v;
}

/* The server join: the code resolves the vault, and the read after it is what
   the toast names. A wrong, spent or expired code is one 404 by design. */
async function joinVaultOnServer(clean: string): Promise<Vault> {
  const res = await apiClient.vaults.joinByCode(clean);
  if (!res.success || !res.data?.vaultId) {
    const code = String((res.error as { code?: string } | undefined)?.code ?? "");
    if (code === "INVITE_INVALID" || code === "HTTP_404") throw new ApiError("not_found", "Code not found.");
    if (code === "HTTP_403" || code === "FORBIDDEN") {
      throw new ApiError("state", "Only a client account can join a vault.");
    }
    throw new ApiError("network", res.message || "The join did not go through.");
  }

  /* the code has been spent at this point: a failed read is still a join */
  const read = await apiClient.vaults.getById(res.data.vaultId);
  const raw = read.success ? (read.data as any) : null;
  const members: any[] = Array.isArray(raw?.members) ? raw.members : [];
  const freelancer = members.find((m) => String(m.role).toUpperCase() === "FREELANCER");

  return {
    id: String(res.data.vaultId),
    project: String(raw?.title ?? "Vault"),
    freelancer: String(freelancer?.fullName ?? "Freelancer"),
    amountUSD: Number(raw?.amount ?? 0),
    status: "awaiting_payment",
    createdAt: Date.now(),
  };
}

/* POST /api/vaults/join { code } — the signed-in client redeems the code on the
   server. Demo builds keep the registry below; a real one never pretends. */
export async function joinVault(code: string): Promise<Vault> {
  const normalized = code.trim().toUpperCase();
  if (realOn("vaultsWrite") && !isDemoMode()) return joinVaultOnServer(normalized);

  return call(() => {
    const clean = normalized;
    /* codes are minted in this browser and there is no server route to redeem
       one, so a real account is told the truth instead of being shown a failure
       that reads like a typo */
    if (!isDemoMode()) {
      throw new ApiError(
        "state",
        "Joining by code isn’t available yet. Ask your freelancer to invite the email on your account."
      );
    }
    /* codes minted by the freelancer surface: the registry stands in for the
       invite table a real backend would query */
    const invited = lookupInvite(clean);
    if (invited) {
      if (vaults.some((v) => v.project === invited.project)) {
        throw new ApiError("conflict", "You already joined this vault.");
      }
      const joined: Vault = {
        id: uid("v_join"),
        project: invited.project,
        freelancer: "Maya",
        amountUSD: invited.amountCents / 100,
        status: "awaiting_payment",
        createdAt: Date.now(),
      };
      vaults = [joined, ...vaults];
      return joined;
    }
    if (clean !== "DEMO-1234") throw new ApiError("not_found", "Code not found.");
    if (vaults.some((v) => v.project === "Demo Project")) throw new ApiError("conflict", "You already joined this vault.");
    const vault: Vault = {
      id: uid("v_demo"),
      project: "Demo Project",
      freelancer: "Iris",
      amountUSD: 450,
      status: "awaiting_payment",
      createdAt: Date.now(),
    };
    vaults = [vault, ...vaults];
    return vault;
  });
}
/* ------------------------------------------------------------ realtime --- */

/* GET /v1/events (server-sent events) */
export function subscribe(cb: (event: LedgerEvent) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/* -------------------------------------------------------- dev helpers ---- */

/* The keyboard demo panel calls this: fire any event by hand. */
export function simulateWebhook(vaultId: string, type: LedgerType): void {
  const v = vaults.find((x) => x.id === vaultId);
  if (!v) return;
  const next: Partial<Record<LedgerType, VaultStatus>> = {
    "PAYMENT.AUTHORIZED": "held",
    "PAYMENT.CAPTURED": "unlocked",
    "PAYMENT.VOIDED": "voided",
    "AUDIT.COMPLETED": "audited",
  };
  const status = next[type];
  if (status) setStatus(v.id, status);
  emit(type, v.id, "Fired by hand from the dev panel", { amountUSD: v.amountUSD, paypalId: v.paypalOrderId });
  if (type === "PAYMENT.CAPTURED") emit("FILES.UNLOCKED", v.id, "Delivery unlocked to the freelancer", { paypalId: v.paypalOrderId });
}

/* The dev panel's list, and the one place the seed order lives. Exported so the
   panel does not have to guess at ids. */
export const devVaultIds = () => vaults.map((v) => ({ id: v.id, project: v.project }));

/* ============================================================ audit room ===
   Everything below feeds /vault/:id. Same clock, same error rate, same event
   bus: a check run and a chat answer are reads of the audit service, and the
   decision panel still writes through authorizeVault / approveVault /
   rejectVault. */

export type CheckResult = "queued" | "running" | "pass" | "warn" | "fail";

export type SourceChip =
  | "TEST LOG"
  | "BROWSER TEST"
  | "PIXEL SCAN"
  | "HTTP PROBE"
  | "DEMO CACHE"
  | "FILE INDEX"
  | "VAULT DATA";

/* a chip that cites a check: the demo-cache chip is an answer property, not a
   check source, so the two are kept apart */
export type CheckSource = Exclude<SourceChip, "DEMO CACHE">;

export interface CheckRow {
  label: string;
  value: string;
}

export interface VaultCheck {
  id: string;
  name: string;
  detail: string;
  source: CheckSource;
  /* the result the check lands on when it runs */
  result: Exclude<CheckResult, "queued" | "running">;
  state: CheckResult;
  rows: CheckRow[];
  swatch?: string;
}

export interface VaultFile {
  id: string;
  name: string;
  kind: "file" | "folder" | "url";
  meta: string;
  url?: string;
  children?: string[];
}

export interface ChatMessage {
  id: string;
  role: "ai" | "user";
  text: string;
  sources: SourceChip[];
  cached: boolean;
  at: number;
}

export interface VaultDetail {
  vault: Vault;
  files: VaultFile[];
  checks: VaultCheck[];
  messages: ChatMessage[];
  suggestions: string[];
  questionsUsed: number;
  questionLimit: number;
}

export const QUESTION_LIMIT = 15;

/* ------------------------------------------------------------ room seed --- */

type Seed = Pick<VaultDetail, "files" | "checks" | "suggestions">;

const ROOM_SEED: Record<string, Seed> = {
  v_booking_app: {
    suggestions: [
      "Does registration and checkout work?",
      "Which tests covered the payment step?",
      "Anything broken in the staging build?",
    ],
    files: [
      { id: "f_staging", name: "staging.booking-demo.app", kind: "url", meta: "LIVE", url: "https://staging.booking-demo.app" },
      { id: "f_src", name: "/src", kind: "folder", meta: "42 files", children: ["app/ · 12 files", "components/ · 18 files", "lib/ · 12 files"] },
      { id: "f_tests", name: "/tests", kind: "folder", meta: "12 files", children: ["e2e/ · 7 files", "unit/ · 5 files"], },
      { id: "f_pkg", name: "package.json", kind: "file", meta: "2 KB" },
      { id: "f_log", name: "test-log.xml", kind: "file", meta: "18 KB" },
    ],
    checks: [
      {
        id: "c_integration",
        name: "Integration tests",
        detail: "5 of 5 passed",
        source: "TEST LOG",
        result: "pass",
        state: "queued",
        rows: [
          { label: "registers a new account", value: "passed" },
          { label: "signs in with a held session", value: "passed" },
          { label: "adds a booking slot", value: "passed" },
          { label: "captures the payment", value: "passed" },
          { label: "writes the confirmation email", value: "passed" },
        ],
      },
      {
        id: "c_registration",
        name: "Registration flow",
        detail: "HTTP 200 in 412 ms",
        source: "HTTP PROBE",
        result: "pass",
        state: "queued",
        rows: [
          { label: "endpoint", value: "POST /api/register" },
          { label: "status", value: "200 OK" },
          { label: "ttfb", value: "412 ms" },
        ],
      },
      {
        id: "c_checkout",
        name: "Checkout flow",
        detail: "Completes in the browser",
        source: "BROWSER TEST",
        result: "pass",
        state: "queued",
        rows: [
          { label: "steps", value: "7 of 7" },
          { label: "console errors", value: "0" },
          { label: "viewport", value: "1440 x 900" },
        ],
      },
      {
        id: "c_secrets",
        name: "No exposed secrets",
        detail: "Bundle is clean",
        source: "TEST LOG",
        result: "pass",
        state: "queued",
        rows: [
          { label: "pattern hits", value: "0" },
          { label: "files scanned", value: "42" },
        ],
      },
    ],
  },
  v_logo_pack: {
    suggestions: [
      "Is the background transparent?",
      "Does the navy match #000080?",
      "What resolution are the exports?",
    ],
    files: [
      { id: "f_primary_png", name: "logo-primary.png", kind: "file", meta: "2.1 MB" },
      { id: "f_primary_pdf", name: "logo-primary.pdf", kind: "file", meta: "480 KB" },
      { id: "f_mono", name: "logo-mono.png", kind: "file", meta: "1.4 MB" },
      { id: "f_guide", name: "brand-guide.pdf", kind: "file", meta: "3.2 MB" },
    ],
    checks: [
      {
        id: "c_alpha",
        name: "Transparent background",
        detail: "Alpha channel present",
        source: "PIXEL SCAN",
        result: "pass",
        state: "queued",
        rows: [
          { label: "corners", value: "alpha 0" },
          { label: "channel", value: "RGBA" },
        ],
      },
      {
        id: "c_color",
        name: "Primary color",
        detail: "Matches #000080",
        source: "PIXEL SCAN",
        result: "pass",
        state: "queued",
        swatch: "#000080",
        rows: [
          { label: "sampled", value: "#000080" },
          { label: "delta", value: "0.4 per channel" },
        ],
      },
      {
        id: "c_resolution",
        name: "Resolution",
        detail: "4000 x 4000",
        source: "PIXEL SCAN",
        result: "pass",
        state: "queued",
        rows: [
          { label: "pixels", value: "4000 x 4000" },
          { label: "dpi", value: "300 at 13in" },
        ],
      },
      {
        id: "c_safe_area",
        name: "Safe-area padding",
        detail: "4% · below the 8% we recommend",
        source: "PIXEL SCAN",
        result: "warn",
        state: "queued",
        rows: [
          { label: "measured", value: "4%" },
          { label: "recommended", value: "8%" },
          { label: "effect", value: "tight at small sizes" },
        ],
      },
    ],
  },
};

const GENERIC_SEED: Seed = {
  suggestions: ["What was delivered?", "Are there any warnings?", "Is the build ready to ship?"],
  files: [
    { id: "g_src", name: "delivery.zip", kind: "file", meta: "8.4 MB" },
    { id: "g_docs", name: "/docs", kind: "folder", meta: "3 files", children: ["README.md", "notes.md", "changelog.md"] },
    { id: "g_readme", name: "README.md", kind: "file", meta: "6 KB" },
  ],
  checks: [
    { id: "g_tests", name: "Build" , detail: "Compiles clean", source: "TEST LOG", result: "pass", state: "queued", rows: [{ label: "errors", value: "0" }] },
    { id: "g_links", name: "Link probe", detail: "All links answer 200", source: "HTTP PROBE", result: "pass", state: "queued", rows: [{ label: "links", value: "14" }] },
    { id: "g_visual", name: "Visual pass", detail: "No layout breaks", source: "BROWSER TEST", result: "pass", state: "queued", rows: [{ label: "viewports", value: "3" }] },
  ],
};

const seedFor = (id: string): Seed => ROOM_SEED[id] ?? GENERIC_SEED;

/* the audit's own state, kept in memory beside the vaults */
const checkedAt = new Map<string, number>();
const questionsUsed = new Map<string, number>();

/* a non-2xx answer becomes the room's error state; it never quietly turns
   into seeded demo data, so a 404 reads as a missing vault instead of a fake
   one and a 401 sends the reader back to sign in. */
async function failWith(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}) as any);
  const kind: ApiErrorKind =
    res.status === 404 ? "not_found" : res.status === 409 ? "state" : "network";
  throw new ApiError(kind, body?.message || fallback);
}

/* GET /api/vaults/{id}/audit-detail */
export async function getVaultDetail(id: string): Promise<VaultDetail> {
  if (isDemoMode()) return demoVaultDetail(id);

  const res = await fetch(`${API_BASE}/api/vaults/${id}/audit-detail`, {
    headers: authHeaders(),
  });
  if (!res.ok) return failWith(res, "The vault could not be opened.");

  const d = (await res.json()).data;
  const v = d.vault ?? {};
  return {
    vault: {
      id: v.id,
      project: v.title,
      freelancer: v.freelancerName || "Freelancer",
      amountUSD: Number(v.amount) || 0,
      status: mapBackendStatusToFrontend(v.status),
      createdAt: new Date(v.createdAt || v.created_at || Date.now()).getTime(),
      paypalOrderId: v.paypalOrderId || undefined,
      captureId: v.paypalCaptureId || undefined,
    },
    files: (d.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      kind: f.kind || "file",
      meta: f.meta || "",
    })),
    checks: (d.checks || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      detail: c.detail,
      source: c.source || "TEST LOG",
      result: c.result || "pass",
      state: c.state || "queued",
      rows: c.rows || [],
    })),
    messages: [],
    suggestions: d.suggestions || ["What was delivered?", "Are there any issues?", "Is the build ready to ship?"],
    questionsUsed: d.questionsUsed ?? 0,
    questionLimit: d.questionLimit ?? QUESTION_LIMIT,
  };
}

/* the offline room, only for a build with no API or an explicit ?demo=1 */
function demoVaultDetail(id: string): Promise<VaultDetail> {
  return call(() => {
    const v = find(id);
    const seed = seedFor(id);
    const settled = v.status === "audited" || v.status === "unlocked";
    return {
      vault: { ...v },
      files: seed.files.map((f) => ({ ...f })),
      checks: seed.checks.map((c) => ({ ...c, state: settled ? c.result : "queued", rows: c.rows.map((r) => ({ ...r })) })),
      messages: [],
      suggestions: [...seed.suggestions],
      questionsUsed: questionsUsed.get(id) ?? 0,
      questionLimit: QUESTION_LIMIT,
    };
  });
}

/* GET /api/vaults/{id}/audit-detail (files subset) */
export async function listFiles(id: string): Promise<VaultFile[]> {
  if (isDemoMode()) {
    return call(() => {
      find(id);
      return seedFor(id).files.map((f) => ({ ...f }));
    });
  }
  return (await getVaultDetail(id)).files;
}

/* GET /api/uploads/download/{fileId} — the endpoint sits behind the bearer
   token, so the bytes are fetched here and handed to the browser as a blob
   instead of opening a URL that would arrive unauthenticated. */
export async function downloadVaultFile(fileId: string, name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/uploads/download/${encodeURIComponent(fileId)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return failWith(res, "That file could not be downloaded.");

  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* POST /api/vaults/{id}/checks/run — runs audit checks on backend, with
   visual progress animation on the frontend per check card. */
export async function runChecks(
  id: string,
  onProgress?: (checkId: string, state: CheckResult) => void
): Promise<VaultCheck[]> {
  if (!isDemoMode()) {
    /* FX.real.audit runs the checks through the http client, so a timeout or a
       refused status reaches the room as the error it already renders */
    const run = realOn("audit")
      ? await request<{ checks?: any[] }>(`/vaults/${id}/checks/run`, { method: "POST" })
      : await (async () => {
          const res = await fetch(`${API_BASE}/api/vaults/${id}/checks/run`, {
            method: "POST",
            headers: authHeaders(),
          });
          if (!res.ok) return failWith(res, "The checks did not finish.");
          return (await res.json()).data;
        })();

    const serverChecks: VaultCheck[] = (run?.checks || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      detail: c.detail,
      source: c.source || "TEST LOG",
      result: c.result || "pass",
      state: c.state || c.result || "pass",
      rows: c.rows || [],
    }));

    /* the server has already computed the results; the room still watches them
       land one card at a time */
    const timings = [618, 800, 1000, 618];
    for (let i = 0; i < serverChecks.length; i++) {
      const chk = serverChecks[i];
      onProgress?.(chk.id, "running");
      await wait(timings[i % timings.length]);
      onProgress?.(chk.id, chk.result);
    }
    checkedAt.set(id, Date.now());
    emit("AUDIT.COMPLETED", id, "Audit run finished, report ready", {});
    return serverChecks;
  }

  /* demo: the in-memory audit */
  const v = find(id);
  expectStatus(v, ["held"], "be audited");
  const seed = seedFor(id).checks;
  const timings = [618, 1000, 1618, 1000];
  const done: VaultCheck[] = [];
  for (let i = 0; i < seed.length; i++) {
    const def = seed[i];
    onProgress?.(def.id, "running");
    await wait(timings[i % timings.length]);
    if (Math.random() < FAIL_RATE) {
      onProgress?.(def.id, "queued");
      throw new ApiError("network", "A check could not reach the audit runner.");
    }
    onProgress?.(def.id, def.result);
    done.push({ ...def, state: def.result, rows: def.rows.map((r) => ({ ...r })) });
  }
  setStatus(id, "audited");
  checkedAt.set(id, Date.now());
  emit("AUDIT.COMPLETED", id, "Audit run finished, report ready", { paypalId: v.paypalOrderId });
  return done;
}

/* POST /api/vaults/{id}/chat — calls the real backend AI endpoint.
   Falls back to in-memory answerFor() if backend is unreachable. */
export async function askAI(
  id: string,
  question: string,
  onToken: (chunk: string) => void
): Promise<{ text: string; sources: SourceChip[]; cached: boolean }> {
  if (!isDemoMode()) {
    const d = realOn("audit")
      ? await request<{ text?: string; sources?: SourceChip[]; cached?: boolean }>(`/vaults/${id}/chat`, {
          method: "POST",
          body: { question },
        })
      : await (async () => {
          const res = await fetch(`${API_BASE}/api/vaults/${id}/chat`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ question }),
          });
          if (!res.ok) return failWith(res, "The audit agent did not answer.");
          return (await res.json()).data;
        })();
    const text: string = d.text || "";
    /* trickle tokens locally for the streaming effect */
    for (const char of text) {
      onToken(char);
      await wait(18);
    }
    questionsUsed.set(id, (questionsUsed.get(id) ?? 0) + 1);
    return {
      text,
      sources: (d.sources || []) as SourceChip[],
      cached: d.cached ?? false,
    };
  }

  /* demo: the scripted answer */
  const v = find(id);
  await wait(latency());
  if (Math.random() < FAIL_RATE) throw new ApiError("network", "The audit agent did not answer.");
  const answer = answerFor(v, question);
  for (const char of answer.text) {
    onToken(char);
    await wait(25);
  }
  questionsUsed.set(id, (questionsUsed.get(id) ?? 0) + 1);
  return { text: answer.text, sources: answer.sources, cached: true };
}

function answerFor(v: Vault, question: string): { text: string; sources: SourceChip[] } {
  const q = question.toLowerCase();

  if (v.id === "v_booking_app" && /register|checkout|bug|test|work/.test(q)) {
    return {
      text:
        "I analyzed the 5 integration tests covering registration and payment capture. All passed with zero errors. I also loaded the staging flow in a browser and it completed.",
      sources: ["TEST LOG", "BROWSER TEST", "DEMO CACHE"],
    };
  }

  if (v.id === "v_logo_pack" && /color|colour|hex|navy|#000080|transparent|background/.test(q)) {
    return {
      text:
        "The primary PNG has a fully transparent alpha channel. I extracted the main color and it matches #000080 exactly.",
      sources: ["PIXEL SCAN", "DEMO CACHE"],
    };
  }

  return {
    text: "I can check test results, staging behavior, color values and transparency. Try one of the suggestions.",
    sources: ["DEMO CACHE"],
  };
}

/* the room's receipt line: when the capture happened, for the unlocked panel */
export const capturedAt = (id: string) => checkedAt.get(id) ?? undefined;

/* ================================================================ settings ===
   The client's account: profile, notifications, password, sessions, 2FA and the
   two destructive actions. Same seam as everything above — the same clock, the
   same optional failure behind FX.mockErrors — and the same promise: each
   function names the endpoint it will call once this is not a mock.

   Only the mutable half lives in the store. The address and the role are read
   from the signed-in session on every call, so Settings can never drift from
   what the rail and the guard believe. */

export type MotionPref = "system" | "reduce" | "full";

export interface AccountProfile {
  fullName: string;
  email: string;
  role: Role;
  memberSince: string;
  /* freelancers are paid here; clients never see the field */
  paypalEmail: string | null;
}

export type NotifKey =
  | "payment_authorized"
  | "audit_completed"
  | "payment_captured"
  | "files_unlocked"
  | "hold_voided"
  | "payout_sent"
  | "payout_failed"
  | "weekly_summary";

export interface NotifPref {
  email: boolean;
  inapp: boolean;
}

export type NotificationPrefs = Record<NotifKey, NotifPref>;

export interface LoginSession {
  id: string;
  device: string;
  place: string;
  lastActive: string;
  current: boolean;
}

export interface AccountSettings {
  profile: AccountProfile;
  notifications: NotificationPrefs;
  motion: MotionPref;
  mfaOn: boolean;
  /* the freelancer's failed-payout behavior; clients read it too and ignore it */
  payoutRetry: PayoutRetryMode;
}

export const SETTINGS_MEMBER_SINCE = "OCT 2026";
export const TWO_FACTOR_SECRET = "DEMO-2FA-KEY";
export const TWO_FACTOR_CODE = "123456";
export const TWO_FACTOR_BAD_CODE = "Code didn't match.";
export const DELETE_BLOCKED = "Resolve these vaults first. Your held funds must be approved or voided.";

export const NOTIF_DEFAULTS: NotificationPrefs = {
  payment_authorized: { email: true, inapp: true },
  audit_completed: { email: true, inapp: true },
  payment_captured: { email: true, inapp: true },
  files_unlocked: { email: true, inapp: true },
  hold_voided: { email: true, inapp: true },
  /* the freelancer's two money rows: payout moved / payout failed */
  payout_sent: { email: true, inapp: true },
  payout_failed: { email: true, inapp: true },
  /* one email a week; there is no in-app digest to toggle */
  weekly_summary: { email: true, inapp: false },
};

const SESSION_SEED: LoginSession[] = [
  { id: "s_this", device: "Chrome on Windows", place: "Cairo", lastActive: "this device", current: true },
  { id: "s_iphone", device: "Safari on iPhone", place: "Cairo", lastActive: "2 days ago", current: false },
  { id: "s_mac", device: "Firefox on macOS", place: "Alexandria", lastActive: "9 days ago", current: false },
];

/* the seeded name, when Settings has never been saved in this tab */
const nameFrom = (email: string) => {
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Client";
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
};

const SETTINGS_KEY = "vl.settings";

interface SettingsStore {
  fullName: string;
  notifications: NotificationPrefs;
  motion: MotionPref;
  mfaOn: boolean;
  /* the freelancer's payout address: one value that the Overview banner, the
     Payments page's payout-method card and the Settings profile card all read */
  payoutEmail: string | null;
  /* what happens after a failed payout: retried automatically or confirmed */
  payoutRetry: PayoutRetryMode;
}

/** What a failed payout does: hit it again on its own, or wait for a yes. */
export type PayoutRetryMode = "retry_auto" | "ask_first";

const accountEmail = () => readSession()?.email ?? "client@vaultlance.demo";
const accountRole = (): Role => readSession()?.role ?? roleFor(accountEmail());

const copyNotifs = (n: NotificationPrefs): NotificationPrefs =>
  Object.fromEntries(Object.entries(n).map(([k, v]) => [k, { ...v }])) as NotificationPrefs;

let store: SettingsStore | null = null;
/* the sessions live beside the vaults so a password change and a revoke share
   one list */
let sessions: LoginSession[] = SESSION_SEED.map((row) => ({ ...row }));

/* the store is memory plus a try/catch mirror, exactly like the session: a
   private window loses it and the page still renders */
function load(): SettingsStore {
  if (store) return store;
  const base: SettingsStore = {
    fullName: nameFrom(accountEmail()),
    notifications: copyNotifs(NOTIF_DEFAULTS),
    motion: "system",
    mfaOn: false,
    /* freelancers start addressable so the demo's money flows work; Settings
       and the dev panel can clear it, which is what the banner reacts to */
    payoutEmail: PAYOUT_EMAIL_DEFAULT,
    payoutRetry: "ask_first",
  };
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<SettingsStore>;
      if (typeof saved.fullName === "string" && saved.fullName.trim()) base.fullName = saved.fullName;
      if (saved.notifications) base.notifications = { ...copyNotifs(NOTIF_DEFAULTS), ...saved.notifications };
      if (saved.motion === "system" || saved.motion === "reduce" || saved.motion === "full") base.motion = saved.motion;
      if (typeof saved.mfaOn === "boolean") base.mfaOn = saved.mfaOn;
      if ("payoutEmail" in saved && (saved.payoutEmail === null || typeof saved.payoutEmail === "string"))
        base.payoutEmail = saved.payoutEmail;
      if (saved.payoutRetry === "retry_auto" || saved.payoutRetry === "ask_first") base.payoutRetry = saved.payoutRetry;
    }
  } catch {
    /* an unreadable mirror is the same as an empty one */
  }
  store = base;
  return base;
}

function persist(): void {
  if (!store) return;
  try {
    window.sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(store));
  } catch {
    /* the context still holds it for this tab */
  }
}

/* Settings writes go through here: the mock's failure rate is opt-in, so the
   save paths only fail when FX.mockErrors is on */
async function settingsCall<T>(fn: () => T): Promise<T> {
  await wait(latency());
  if (FX.mockErrors && Math.random() < FAIL_RATE) {
    throw new ApiError("network", "The request did not reach the server.");
  }
  return fn();
}

const profileOf = (s: SettingsStore): AccountProfile => ({
  fullName: s.fullName,
  email: accountEmail(),
  role: accountRole(),
  memberSince: SETTINGS_MEMBER_SINCE,
  paypalEmail: accountRole() === "freelancer" ? s.payoutEmail : null,
});

/* a real session's member-since line, from the account's own created date */
const memberSinceOf = (iso: unknown): string => {
  const at = iso ? new Date(iso as string) : new Date();
  if (Number.isNaN(at.getTime())) return SETTINGS_MEMBER_SINCE;
  return at.toLocaleDateString("en-GB", { month: "short", year: "numeric" }).toUpperCase();
};

/* GET /v1/me/settings — the profile half comes from the server, the rest of the
   page's preferences are still this browser's */
export async function getSettings(): Promise<AccountSettings> {
  const s = load();

  if (!isDemoMode()) {
    const res = await apiClient.me.get();
    if (!res.success || !res.data) {
      throw new ApiError("network", res.message || "Your account could not be loaded.");
    }
    const me = res.data;
    const role: Role = String(me.role).toUpperCase() === "FREELANCER" ? "freelancer" : "client";
    return {
      profile: {
        fullName: me.fullName || s.fullName,
        email: me.email,
        role,
        memberSince: memberSinceOf(me.createdAt),
        paypalEmail: role === "freelancer" ? s.payoutEmail : null,
      },
      notifications: copyNotifs(s.notifications),
      motion: s.motion,
      mfaOn: s.mfaOn,
      payoutRetry: s.payoutRetry,
    };
  }

  return settingsCall(() => {
    return {
      profile: profileOf(s),
      notifications: copyNotifs(s.notifications),
      motion: s.motion,
      mfaOn: s.mfaOn,
      payoutRetry: s.payoutRetry,
    };
  });
}

/** The mock payout address freelancers start with: the same one string the
    Overview banner, the Payments payout-method card and Settings read. */
export const PAYOUT_EMAIL_DEFAULT = "maya.chen@paypal.example";

/** Synchronous read for the views that must not wait on a fetch: the Overview
    banner's condition and the Payments page's payout-method card. */
export const readPayoutEmail = (): string | null => load().payoutEmail;
export const hasPayoutEmail = (): boolean => !!load().payoutEmail;

/** Dev helper: clears the address so the banner's absence is answerable. */
export function setPayoutEmail(email: string | null): void {
  const s = load();
  s.payoutEmail = email;
  persist();
}

/* PUT /v1/me/payout-profile — the payout address, validated here so Settings
   cannot save an unusable one. */
export async function updatePayoutProfile(patch: { paypalEmail: string }): Promise<AccountProfile> {
  return settingsCall(() => {
    const email = patch.paypalEmail.trim();
    if (!email) throw new ApiError("state", "Add a PayPal email.");
    const problem = emailError(email);
    if (problem) throw new ApiError("state", problem);
    const s = load();
    s.payoutEmail = email;
    persist();
    return profileOf(s);
  });
}

/* PUT /v1/me/payout-prefs — what a failed payout does next. */
export async function updatePayoutPrefs(patch: { retry: PayoutRetryMode }): Promise<{ payoutRetry: PayoutRetryMode }> {
  return settingsCall(() => {
    const s = load();
    s.payoutRetry = patch.retry;
    persist();
    return { payoutRetry: s.payoutRetry };
  });
}

/* PATCH /v1/me */
export async function updateProfile(patch: { fullName: string }): Promise<AccountProfile> {
  const name = patch.fullName.trim();
  if (name.length < 2) throw new ApiError("state", "Name needs at least 2 characters.");
  if (name.length > 60) throw new ApiError("state", "Name can be at most 60 characters.");

  if (!isDemoMode()) {
    const data = realOn("settings")
      ? await request<{ fullName?: string; email?: string; createdAt?: string }>("/auth/me", {
          method: "PATCH",
          body: { fullName: name },
        })
      : await (async () => {
          const res = await apiClient.me.updateProfile({ fullName: name });
          if (!res.success || !res.data) {
            throw new ApiError("state", res.message || "Your name could not be saved.");
          }
          return res.data;
        })();
    const s = load();
    s.fullName = data.fullName || name;
    persist();
    return {
      fullName: s.fullName,
      email: data.email ?? accountEmail(),
      role: accountRole(),
      memberSince: memberSinceOf(data.createdAt),
      paypalEmail: accountRole() === "freelancer" ? s.payoutEmail : null,
    };
  }

  return settingsCall(() => {
    const name = patch.fullName.trim();
    if (name.length < 2) throw new ApiError("state", "Name needs at least 2 characters.");
    if (name.length > 60) throw new ApiError("state", "Name can be at most 60 characters.");
    const s = load();
    s.fullName = name;
    persist();
    return profileOf(s);
  });
}

/* PATCH /v1/me/preferences — the motion choice is a profile preference, not a
   notification one, so it travels on its own call. */
export async function updatePreferences(patch: { motion: MotionPref }): Promise<{ motion: MotionPref }> {
  return settingsCall(() => {
    const s = load();
    s.motion = patch.motion;
    persist();
    return { motion: s.motion };
  });
}

/* PUT /v1/me/notifications */
export async function updateNotifications(prefs: NotificationPrefs): Promise<NotificationPrefs> {
  return settingsCall(() => {
    const s = load();
    s.notifications = copyNotifs(prefs);
    persist();
    return copyNotifs(s.notifications);
  });
}

/* POST /v1/auth/change-password */
export async function changePassword(
  current: string,
  next: string
): Promise<{ sessions: LoginSession[] }> {
  if (next.length < MIN_PASSWORD) throw new ApiError("state", `Use at least ${MIN_PASSWORD} characters.`);

  if (!isDemoMode()) {
    try {
      await authApi.changePassword(current, next);
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : "The password could not be changed.";
      const wrong = /current password/i.test(message);
      throw new ApiError(wrong ? "state" : "network", message);
    }
    return { sessions: await listSessions() };
  }

  return settingsCall(() => {
    if (!checkCurrentPassword(current)) throw new ApiError("state", WRONG_CURRENT_PASSWORD);
    if (next.length < MIN_PASSWORD) throw new ApiError("state", `Use at least ${MIN_PASSWORD} characters.`);
    /* the real service revokes every other session on a password change; the
       mock drops them here so the list tells the same story */
    sessions = sessions.filter((row) => row.current);
    return { sessions: sessions.map((row) => ({ ...row })) };
  });
}

/* GET /v1/me/sessions */
export async function listSessions(): Promise<LoginSession[]> {
  if (!isDemoMode()) {
    /* the server revokes the other sessions on a password change and keeps no
       device list of its own, so this browser is the only row there is */
    return [{ id: "current", device: "This browser", place: "—", lastActive: "this device", current: true }];
  }
  return settingsCall(() => sessions.map((row) => ({ ...row })));
}

/* DELETE /v1/me/sessions/{id} */
export async function revokeSession(id: string): Promise<LoginSession[]> {
  if (!isDemoMode()) {
    if (id === "current") throw new ApiError("state", "This device cannot be revoked from here.");
    return listSessions();
  }
  return settingsCall(() => {
    const row = sessions.find((s) => s.id === id);
    if (!row) throw new ApiError("not_found", "That session is already gone.");
    if (row.current) throw new ApiError("state", "This device cannot be revoked from here.");
    sessions = sessions.filter((s) => s.id !== id);
    return sessions.map((s) => ({ ...s }));
  });
}

/* DELETE /v1/me/sessions (every session but this one) */
export async function revokeOtherSessions(): Promise<LoginSession[]> {
  if (!isDemoMode()) return listSessions();
  return settingsCall(() => {
    sessions = sessions.filter((s) => s.current);
    return sessions.map((s) => ({ ...s }));
  });
}

/* POST /v1/me/mfa/enroll */
export async function startTwoFactor(): Promise<{ secret: string }> {
  return settingsCall(() => ({ secret: TWO_FACTOR_SECRET }));
}

/* POST /v1/me/mfa/verify */
export async function confirmTwoFactor(code: string): Promise<{ mfaOn: true }> {
  return settingsCall(() => {
    if (code.trim() !== TWO_FACTOR_CODE) throw new ApiError("state", TWO_FACTOR_BAD_CODE);
    const s = load();
    s.mfaOn = true;
    persist();
    return { mfaOn: true as const };
  });
}

/* DELETE /v1/me/mfa */
export async function disableTwoFactor(): Promise<{ mfaOn: false }> {
  return settingsCall(() => {
    const s = load();
    s.mfaOn = false;
    persist();
    return { mfaOn: false as const };
  });
}

/* GET /v1/me/export — the server returns the payload, the browser wraps it */
export async function exportData(): Promise<Blob> {
  if (!isDemoMode()) {
    const res = await apiClient.me.export();
    if (!res.success || !res.data) {
      throw new ApiError("network", res.message || "The export could not be built.");
    }
    return new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
  }

  return settingsCall(() => {
    const s = load();
    const payload = {
      exportedAt: new Date().toISOString(),
      sandbox: true,
      profile: profileOf(s),
      notifications: s.notifications,
      vaults: vaults.map((v) => ({ ...v })),
      events: events.map((e) => ({ ...e })),
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  });
}

/* DELETE /v1/me — refused while any vault is held or audited */
export async function deleteAccount(emailConfirm: string): Promise<void> {
  if (!isDemoMode()) {
    try {
      await authApi.deleteAccount(emailConfirm.trim());
    } catch (e) {
      /* 409 carries the server's blocking reason; it is shown as it arrives */
      throw new ApiError("state", e instanceof Error && e.message ? e.message : "The account could not be deleted.");
    }
    clearSession();
    return;
  }

  return settingsCall(() => {
    const held = vaults.filter((v) => v.status === "held" || v.status === "audited");
    if (held.length) throw new ApiError("state", DELETE_BLOCKED);
    if (emailConfirm.trim().toLowerCase() !== accountEmail().toLowerCase()) {
      throw new ApiError("state", "That email doesn't match this account.");
    }
    clearSession();
  });
}

/* GET /v1/me/delete-blockers — the vaults standing between the client and
   deletion, with their ids so the modal can link to the audit room */
export async function listDeleteBlockers(): Promise<Vault[]> {
  if (!isDemoMode()) {
    const rows = await listLiveVaults();
    return rows.filter((v) => v.status === "held" || v.status === "audited");
  }
  return settingsCall(() =>
    vaults.filter((v) => v.status === "held" || v.status === "audited").map((v) => ({ ...v }))
  );
}
