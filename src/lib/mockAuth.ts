/* mockAuth.ts — the authentication layer with DEMO_MODE toggle and real API client connection. */

import { apiClient, isDemoMode } from "./apiClient";
import * as authApi from "./authApi";
import { realOn } from "../config/fx";

export interface SigninCredentials {
  email: string;
  password: string;
}

export type Role = "client" | "freelancer";

export interface Session {
  email: string;
  role: Role;
  since: number;
  name?: string;
  token?: string;
}

export type SigninResult = { ok: true; role: Role } | { ok: false; error: string };

export function roleFor(email: string): Role {
  return email.trim().toLowerCase().includes("freelancer") ? "freelancer" : "client";
}

/* The API signs the role into the JWT it hands the browser, and that is the role
   every route enforces. A session written by an older build, or by a sign-in
   that never reached the API, can carry a guessed role with no token at all —
   so the claim wins whenever the session has one. */
export function roleFromToken(token?: string): Role | null {
  if (!token || typeof atob !== "function") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const padded = part
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(part.length / 4) * 4, "=");
    const claim = String((JSON.parse(atob(padded)) as { role?: unknown }).role ?? "").toLowerCase();
    return claim === "freelancer" || claim === "client" ? claim : null;
  } catch {
    return null;
  }
}

const SESSION_KEY = "vl.dash.session";

export function readSession(): Session | null {
  try {
    const raw = (typeof window !== "undefined" && window.sessionStorage.getItem(SESSION_KEY)) || (typeof window !== "undefined" && window.localStorage.getItem(SESSION_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed || typeof parsed.email !== "string") return null;
    return {
      email: parsed.email,
      /* the role the API issued is the truth: the claim inside the session's
         own token, then any stored role, and the email heuristic only for
         sessions that have neither (demo). Reading it back from the address,
         or trusting a role a buggy sign-in invented, is what put a client in
         the freelancer shell and got it a 403. */
      role:
        roleFromToken(apiClient.getToken() ?? undefined) ??
        (parsed.role === "freelancer" || parsed.role === "client" ? parsed.role : roleFor(parsed.email)),
      since: typeof parsed.since === "number" ? parsed.since : Date.now(),
      ...(typeof parsed.name === "string" && parsed.name.trim() ? { name: parsed.name } : {}),
      /* a token found in storage belongs to an older build and is ignored */
      ...(apiClient.getToken() ? { token: apiClient.getToken() as string } : {}),
    };
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  try {
    /* the bearer token is not part of the stored session: it stays in memory
       (src/lib/http.ts), so a reload signs in again instead of leaving it on
       the disk. */
    const { token, ...stored } = session;
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    if (token) {
      apiClient.setToken(token);
    } else {
      /* a session with no API token must not ride the previous user's one */
      apiClient.clearToken();
    }
  } catch {
    /* storage defense */
  }
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY); if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
    apiClient.clearToken();
  } catch {
    /* nothing to clear */
  }
}

export const FAIL_PREFIX = "fail@";
export const MIN_PASSWORD = 8;
export const BAD_CREDENTIALS = "Wrong email or password.";
export const REACH_FAILED = "Couldn't reach VaultLance. Check your connection and try again.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(value: string): string | null {
  if (!value.trim()) return "Enter your email address.";
  return EMAIL_RE.test(value.trim()) ? null : "Enter a valid email address.";
}

export function passwordError(value: string): string | null {
  if (!value) return "Enter your password.";
  return value.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : null;
}

export const WRONG_CURRENT_PASSWORD = "Current password is wrong.";

export function checkCurrentPassword(current: string): boolean {
  return current.trim().toLowerCase() !== "wrong";
}

/* ---- password reset ---- */
export const RESEND_SECONDS = 55;
export const RESET_LINK_MINUTES = 30;
export const MOCK_RESET_LINK = "/reset-password?token=demo-valid";

export const RESET_EMAIL_EMPTY = "Enter your email.";
export const RESET_EMAIL_BAD = "Enter a valid email address.";
export const RESET_SEND_ERROR = "Couldn't send. Try again.";
export const RESET_TOO_MANY = `Too many attempts. Try again in ${RESEND_SECONDS} seconds.`;
export const RESET_MISMATCH = "Passwords don't match.";
export const MAX_RESET_SENDS = 3;

export function resetEmailError(value: string): string | null {
  if (!value.trim()) return RESET_EMAIL_EMPTY;
  return EMAIL_RE.test(value.trim()) ? null : RESET_EMAIL_BAD;
}

let resetSends = 0;
export const resetSendCount = () => resetSends;
export const noteResetSend = () => (resetSends += 1);

export async function requestReset(
  email: string
): Promise<{ ok: true; devResetUrl: string | null } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: true, devResetUrl: null };

  try {
    const res = await authApi.requestPasswordReset(email.trim());
    return { ok: true, devResetUrl: res.devResetUrl ? String(res.devResetUrl) : null };
  } catch {
    /* the server answers the same for every address, so a failure here is a
       reach problem and never a hint about the account */
    return { ok: false, error: RESET_SEND_ERROR };
  }
}

export type ResetTokenState = "valid" | "expired" | "invalid";

/* the token is checked by the service that minted it; the demo keeps its two
   fixed tokens so the dead ends stay reachable */
export async function verifyResetToken(token: string | null): Promise<ResetTokenState> {
  if (isDemoMode()) {
    if (token === "demo-valid") return "valid";
    if (token === "demo-expired") return "expired";
    return "invalid";
  }
  if (!token) return "invalid";

  try {
    return await authApi.inspectPasswordReset(token);
  } catch {
    return "invalid";
  }
}

export function resetPassword(
  token: string | null,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return resetWith(token ? { token } : null, password);
}

export function resetPasswordWithAccessToken(
  accessToken: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return resetWith({ accessToken }, password);
}

async function resetWith(
  proof: { token: string } | { accessToken: string } | null,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoMode()) {
    const state = await verifyResetToken(proof && "token" in proof ? proof.token : null);
    if (state !== "valid") {
      return { ok: false, error: state === "expired" ? "This link has expired." : "This link isn't valid." };
    }
    if (password.length < MIN_PASSWORD) {
      return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
    }
    return { ok: true };
  }

  if (!proof) return { ok: false, error: "This link isn't valid." };
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
  }

  try {
    await authApi.confirmPasswordReset({ ...proof, password });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return { ok: false, error: message || "Couldn't save the new password. Try again." };
  }
}

/**
 * Sign in supporting both real backend API and DEMO_MODE fallback.
 */
export async function signIn({ email, password }: SigninCredentials): Promise<SigninResult> {
  // If demo mode is active or user explicitly uses mock test prefix
  const real = realOn("auth");

  /* the demo's email tricks belong to the mock: with the flag on, the address is
     just an address and the role comes from the server profile */
  if (isDemoMode() || (!real && email.trim().toLowerCase().startsWith(FAIL_PREFIX))) {
    if (email.trim().toLowerCase().startsWith(FAIL_PREFIX)) {
      return { ok: false, error: BAD_CREDENTIALS };
    }
    const role = roleFor(email);
    writeSession({ email: email.trim(), role, since: Date.now() });
    return { ok: true, role };
  }

  /* Attempt real backend authentication */
  try {
    const session = await authApi.login(email, password);
    const role: Role = String(session.user.role).toUpperCase() === "FREELANCER" ? "freelancer" : "client";
    writeSession({
      email: session.user.email,
      role,
      name: session.user.fullName,
      since: Date.now(),
      token: session.token,
    });
    return { ok: true, role };
  } catch (err) {
    /* a request that never completed is a failed sign-in, not a new session:
       guessing the role here is what minted freelancer sessions whose token
       still belonged to a client */
    const message = err instanceof Error ? err.message : "";
    if (!real) return { ok: false, error: message || REACH_FAILED };
    return { ok: false, error: /wrong|invalid|credential/i.test(message) ? BAD_CREDENTIALS : message || REACH_FAILED };
  }
}
