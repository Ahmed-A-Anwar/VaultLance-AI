/* api.ts — the client dashboard's data seam. Everything below is in-memory and
   delayed on purpose: latency between 300 and 618ms, a 5% simulated network
   failure so the error states are real, and one `subscribe` fan-out that every
   surface (ledger, KPIs, toasts) listens on.

   The shape is deliberately plain so it can be swapped for the OpenAPI service
   behind the same function signatures. Each function names the endpoint it will
   call once this is no longer a mock. */

export type VaultStatus = "awaiting_payment" | "held" | "audited" | "unlocked" | "voided";

export interface Vault {
  id: string;
  project: string;
  freelancer: string;
  amountUSD: number;
  status: VaultStatus;
  createdAt: number;
  paypalOrderId?: string;
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
const paypalId = () => {
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

const FAIL_RATE = 0.05;
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
  const v = vaults.find((x) => x.id === id);
  if (!v) throw new ApiError("not_found", "That vault no longer exists.");
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

/* POST /v1/vaults/{id}/authorize */
export async function authorizeVault(id: string): Promise<Vault> {
  return call(() => {
    const v = find(id);
    expectStatus(v, ["awaiting_payment"], "be authorized");
    const order = paypalId();
    vaults = vaults.map((x) => (x.id === id ? { ...x, status: "held" as VaultStatus, paypalOrderId: order } : x));
    return { ...find(id) };
  }).then((v) => {
    emit("PAYMENT.AUTHORIZED", v.id, "Funds authorized, held in escrow", { amountUSD: v.amountUSD, paypalId: v.paypalOrderId });
    return v;
  });
}

/* POST /v1/vaults/{id}/audit — the audit runs in the room, so this returns
   where to send the client */
export async function auditVault(id: string): Promise<{ route: string }> {
  return call(() => {
    const v = find(id);
    expectStatus(v, ["held"], "be audited");
    return { route: `/vault/${v.id}` };
  });
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

/* POST /v1/vaults/{id}/capture */
export async function approveVault(id: string): Promise<Vault> {
  return call(() => {
    const v = find(id);
    expectStatus(v, ["audited"], "be approved");
    return setStatus(id, "unlocked");
  }).then((v) => {
    emit("PAYMENT.CAPTURED", v.id, "Capture completed, funds moved", { amountUSD: v.amountUSD, paypalId: v.paypalOrderId });
    emit("FILES.UNLOCKED", v.id, "Delivery unlocked to the freelancer", { paypalId: v.paypalOrderId });
    return v;
  });
}

/* POST /v1/vaults/{id}/void */
export async function rejectVault(id: string): Promise<Vault> {
  return call(() => {
    const v = find(id);
    expectStatus(v, ["audited", "held"], "be voided");
    return setStatus(id, "voided");
  }).then((v) => {
    emit("PAYMENT.VOIDED", v.id, "Hold voided, nothing was charged", { amountUSD: v.amountUSD, paypalId: v.paypalOrderId });
    return v;
  });
}

/* POST /v1/vaults/join { code } */
export async function joinVault(code: string): Promise<Vault> {
  return call(() => {
    const clean = code.trim().toUpperCase();
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

export type SourceChip = "TEST LOG" | "BROWSER TEST" | "PIXEL SCAN" | "HTTP PROBE" | "DEMO CACHE";

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

/* GET /v1/vaults/{id} */
export async function getVaultDetail(id: string): Promise<VaultDetail> {
  return call(() => {
    const v = find(id);
    const seed = seedFor(id);
    /* a vault that already passed its audit opens with the results in place */
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

/* GET /v1/vaults/{id}/files */
export async function listFiles(id: string): Promise<VaultFile[]> {
  return call(() => {
    find(id);
    return seedFor(id).files.map((f) => ({ ...f }));
  });
}

/* POST /v1/vaults/{id}/checks:run — resolves with every result, and calls back
   per check so the panel can move one card at a time. On the last result the
   vault is audited and the event bus hears about it. */
export async function runChecks(
  id: string,
  onProgress?: (checkId: string, state: CheckResult) => void
): Promise<VaultCheck[]> {
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

/* POST /v1/vaults/{id}/chat — server-sent answer. The demo matches keywords
   instead of calling a model, and always reports itself as a cached answer. */
export async function askAI(
  id: string,
  question: string,
  onToken: (chunk: string) => void
): Promise<{ text: string; sources: SourceChip[]; cached: boolean }> {
  const v = find(id);
  await wait(latency());
  if (Math.random() < FAIL_RATE) throw new ApiError("network", "The audit agent did not answer.");

  const answer = answerFor(v, question);
  /* 40 characters a second, the way a model trickles tokens */
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
