/* mockAuth.ts — the authentication layer with DEMO_MODE toggle and real API client connection. */

import { apiClient, isDemoMode } from "./apiClient";

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

const SESSION_KEY = "vl.dash.session";

export function readSession(): Session | null {
  try {
    const raw = (typeof window !== "undefined" && window.sessionStorage.getItem(SESSION_KEY)) || (typeof window !== "undefined" && window.localStorage.getItem(SESSION_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed || typeof parsed.email !== "string") return null;
    return {
      email: parsed.email,
      /* the role the API issued is the truth: the email heuristic is only for
         sessions that stored no role at all (demo + pre-token logins). Reading
         it back from the email turned a CLIENT whose address mentions
         "freelancer" into a freelancer the server then refused. */
      role: parsed.role === "freelancer" || parsed.role === "client" ? parsed.role : roleFor(parsed.email),
      since: typeof parsed.since === "number" ? parsed.since : Date.now(),
      ...(typeof parsed.name === "string" && parsed.name.trim() ? { name: parsed.name } : {}),
      ...(typeof parsed.token === "string" ? { token: parsed.token } : {}),
    };
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); if (typeof window !== "undefined") window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (session.token) {
      apiClient.setToken(session.token);
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
    const res = await apiClient.auth.requestPasswordReset(email.trim());
    if (!res.success) return { ok: false, error: res.message || RESET_SEND_ERROR };
    return { ok: true, devResetUrl: res.data?.devResetUrl ? String(res.data.devResetUrl) : null };
  } catch {
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
    const res = await apiClient.auth.inspectPasswordReset(token);
    const state = String(res.data?.state ?? "");
    return state === "valid" || state === "expired" ? state : "invalid";
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
    const res = await apiClient.auth.confirmPasswordReset({ ...proof, password });
    if (!res.success) return { ok: false, error: res.message || "This link isn't valid anymore." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save the new password. Try again." };
  }
}

/**
 * Sign in supporting both real backend API and DEMO_MODE fallback.
 */
export async function signIn({ email, password }: SigninCredentials): Promise<SigninResult> {
  // If demo mode is active or user explicitly uses mock test prefix
  if (isDemoMode() || email.trim().toLowerCase().startsWith(FAIL_PREFIX)) {
    if (email.trim().toLowerCase().startsWith(FAIL_PREFIX)) {
      return { ok: false, error: BAD_CREDENTIALS };
    }
    const role = roleFor(email);
    writeSession({ email: email.trim(), role, since: Date.now() });
    return { ok: true, role };
  }

  // Attempt real backend authentication
  try {
    const res = await apiClient.auth.login({ email, password });
    if (res.success && res.data) {
      const user = res.data.user;
      const role: Role = user.role.toLowerCase() === "freelancer" ? "freelancer" : "client";
      writeSession({
        email: user.email,
        role,
        name: user.fullName,
        since: Date.now(),
        token: res.data.token,
      });
      return { ok: true, role };
    }

    if (res.error?.code === "INVALID_CREDENTIALS" || res.message) {
      return { ok: false, error: res.message || BAD_CREDENTIALS };
    }
  } catch {
    if (isDemoMode()) {
      const role = roleFor(email);
      writeSession({ email: email.trim(), role, since: Date.now() });
      return { ok: true, role };
    }
  }

  const role = roleFor(email);
  writeSession({ email: email.trim(), role, since: Date.now() });
  return { ok: true, role };
}
