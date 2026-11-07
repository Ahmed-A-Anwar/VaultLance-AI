/* playground.ts — a real session for the two reserved sandbox accounts.
 *
 * Both JWTs are minted by the API and kept in sessionStorage, never
 * localStorage, so closing the tab ends the playground. The active role's token
 * goes into the http client; switching roles swaps it and writes the ordinary
 * session record the dashboard and room already read.
 */
import { API_BASE_URL } from "./apiClient";
import { request, setAccessToken } from "./http";
import { writeSession } from "./mockAuth";

export type PlaygroundRole = "freelancer" | "client";
export type SampleKind = "complete" | "incomplete";

export interface PlaygroundAccount {
  email: string;
  fullName: string;
  role: "FREELANCER" | "CLIENT";
}

export interface PlaygroundBuyer {
  email: string;
  password: string;
  label: string;
}

export interface PlaygroundCheck {
  id: string;
  name: string;
  detail: string;
  result: "pass" | "warn" | "fail";
  rows?: Array<{ label: string; value: string }>;
}

export interface PlaygroundView {
  vaultId: string;
  status: string;
  title: string;
  amount: number;
  currency: string;
  sampleKind: SampleKind | null;
  failedChecks: Array<{ id: string; name: string; detail?: string }>;
  checks?: PlaygroundCheck[];
  tokens: Record<PlaygroundRole, string>;
  accounts: Record<PlaygroundRole, { email: string; fullName: string }>;
  buyer: PlaygroundBuyer | null;
}

interface StoredSession {
  vaultId: string;
  role: PlaygroundRole;
  tokens: Record<PlaygroundRole, string>;
  accounts: Record<PlaygroundRole, { email: string; fullName: string }>;
  buyer: PlaygroundBuyer | null;
}

const KEY = "vl.playground.session";

export function readPlaygroundSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      !parsed ||
      typeof parsed.vaultId !== "string" ||
      (parsed.role !== "freelancer" && parsed.role !== "client") ||
      !parsed.tokens ||
      typeof parsed.tokens.freelancer !== "string" ||
      typeof parsed.tokens.client !== "string"
    ) {
      return null;
    }
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

/** Restore the memory-only bearer after a reload or a PayPal round trip. */
export function restorePlaygroundSession(): StoredSession | null {
  const session = readPlaygroundSession();
  if (session) setAccessToken(session.tokens[session.role]);
  return session;
}

function save(view: PlaygroundView, role: PlaygroundRole): StoredSession {
  const session: StoredSession = {
    vaultId: view.vaultId,
    role,
    tokens: view.tokens,
    accounts: view.accounts,
    buyer: view.buyer,
  };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* a private window still holds the tokens in memory for this route */
  }
  applyRole(session, role);
  return session;
}

function applyRole(session: StoredSession, role: PlaygroundRole): void {
  const account = session.accounts[role];
  writeSession({
    email: account.email,
    role,
    name: account.fullName,
    since: Date.now(),
    token: session.tokens[role],
  });
}

export function switchPlaygroundRole(role: PlaygroundRole): StoredSession | null {
  const session = readPlaygroundSession();
  if (!session) return null;
  const next = { ...session, role };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* memory still carries it */
  }
  applyRole(next, role);
  return next;
}

async function postJson<T>(path: string, body: unknown = {}, token?: string | null): Promise<T> {
  /* null means this route is public and must not inherit whichever identity
     the tab was last using */
  const bearer = token === null ? null : token ?? tokenHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json?.error?.code;
    const message = json?.message || "The playground request failed.";
    const error = new Error(message) as Error & { code?: string; status?: number };
    error.code = code;
    error.status = res.status;
    throw error;
  }
  return json.data as T;
}

function tokenHeader(): string | null {
  const session = readPlaygroundSession();
  if (!session) return null;
  return session.tokens[session.role];
}

export async function startPlayground(role: PlaygroundRole = "client"): Promise<PlaygroundView> {
  const view = await postJson<PlaygroundView>("/playground/start", {}, null);
  save(view, role);
  return view;
}

export async function loadPlaygroundSample(kind: SampleKind): Promise<PlaygroundView> {
  const current = readPlaygroundSession();
  const role = current?.role ?? "client";
  if (current) setAccessToken(current.tokens.freelancer);
  const view = await postJson<PlaygroundView>(
    "/playground/sample",
    { kind },
    current?.tokens.freelancer ?? null
  );
  save(view, role);
  return view;
}

export async function resetPlayground(): Promise<PlaygroundView & { deleted: number }> {
  const current = readPlaygroundSession();
  const role = current?.role ?? "client";
  if (current) setAccessToken(current.tokens[role]);
  const view = await postJson<PlaygroundView & { deleted: number }>(
    "/playground/reset",
    {},
    current?.tokens[current.role] ?? null
  );
  save(view, role);
  return view;
}

export async function refreshPlaygroundVault(): Promise<{ status: string; title: string; amount: number } | null> {
  const session = readPlaygroundSession();
  if (!session) return null;
  try {
    const vault = await request<{ status: string; title: string; amount: number }>(`/vaults/${session.vaultId}`);
    return vault;
  } catch {
    return null;
  }
}

/** Asks the API for a real PayPal order and returns the buyer link. */
export async function fundPlaygroundVault(): Promise<string> {
  const session = readPlaygroundSession();
  if (!session) throw new Error("Start the playground first.");
  setAccessToken(session.tokens.client);
  const returnUrl = `${window.location.origin}/playground/return?vault=${session.vaultId}`;
  const order = await request<{ orderId: string; links?: Array<{ rel?: string; href?: string }> }>(
    `/vaults/${session.vaultId}/payment/order`,
    {
      method: "POST",
      body: { returnUrl, cancelUrl: window.location.origin + "/playground" },
      /* PayPal sandbox order creation is a live provider call */
      timeoutMs: 60_000,
    }
  );
  const link =
    order.links?.find((entry) => entry.rel === "payer-action" || entry.rel === "approve")?.href ||
    order.links?.find((entry) => typeof entry.href === "string" && entry.href.includes("paypal.com"))?.href;
  if (!link) throw new Error("PayPal did not return a payer link.");
  return link;
}

/** The return leg: claim the real authorization, then re-run the real checks. */
export async function finishPaypalReturn(): Promise<{ claimed: boolean; status?: string }> {
  const session = readPlaygroundSession();
  if (!session) throw new Error("This tab has no playground session.");
  setAccessToken(session.tokens.client);

  const reconcile = () =>
    request<{ claimed: boolean; status?: string }>(
      `/vaults/${session.vaultId}/payment/reconcile`,
      { method: "POST", body: {}, timeoutMs: 60_000 }
    );
  /* reconcile is idempotent: if the first attempt times out after PayPal
     actually recorded the hold, the retry reads the held state and continues */
  let reconciled: { claimed: boolean; status?: string };
  try {
    reconciled = await reconcile();
  } catch {
    reconciled = await reconcile();
  }

  /* A webhook can record the same hold before the browser comes back, in which
     case reconcile answers "nothing to do". The hold is still real: read the
     vault and continue if PayPal has already moved it past the authorization. */
  if (!reconciled.claimed) {
    const vault = await request<{ status: string }>(`/vaults/${session.vaultId}`);
    const held = ["AUTHORIZED", "IN_PROGRESS", "SUBMITTED", "VERIFYING", "AWAITING_APPROVAL"];
    if (!held.includes(String(vault.status).toUpperCase())) return reconciled;
  }

  await request(`/vaults/${session.vaultId}/checks/run`, { method: "POST", timeoutMs: 90_000 });
  return { claimed: true, status: "AWAITING_APPROVAL" };
}

async function readVaultStatus(vaultId: string): Promise<string | null> {
  try {
    const vault = await request<{ status: string }>(`/vaults/${vaultId}`, { timeoutMs: 30_000 });
    return String(vault.status).toUpperCase();
  } catch {
    return null;
  }
}

async function waitForPaid(vaultId: string): Promise<string> {
  const deadline = Date.now() + 90_000;
  let last = "";
  while (Date.now() < deadline) {
    const status = await readVaultStatus(vaultId);
    if (status) last = status;
    if (status === "PAID") return status;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`The capture is still ${last || "settling"}. Refresh the playground to see its final state.`);
}

export async function approvePlaygroundVault(): Promise<string> {
  const session = readPlaygroundSession();
  if (!session) throw new Error("Start the playground first.");
  setAccessToken(session.tokens.client);

  const approve = () =>
    request(`/vaults/${session.vaultId}/approve`, {
      method: "POST",
      body: {},
      timeoutMs: 60_000,
    });

  try {
    await approve();
  } catch (err) {
    /* A lost response after the server captured is not a failed capture, and a
       connection reset before the server saw it is safe to send once more. */
    const current = (await readVaultStatus(session.vaultId)) ?? (await readVaultStatus(session.vaultId));
    if (current === "PAID" || current === "CAPTURE_PENDING") return waitForPaid(session.vaultId);
    if (current === "AWAITING_APPROVAL" && (err as { status?: number }).status === 0) {
      await approve();
    } else {
      throw err;
    }
  }

  return waitForPaid(session.vaultId);
}
