/* mockAuth.ts — the sign-in rules for the sandbox. Everything here is local and
   synchronous: no network, no storage, nothing to configure. Change the demo
   behavior in this one file. */

export interface SigninCredentials {
  email: string;
  password: string;
}

/* The dashboard reads its role and its signed-in user from here. An address
   containing "freelancer" is a freelancer, everything else is a client; the
   rule lives in this one function so it can be changed in one place. */
export type Role = "client" | "freelancer";

export interface Session {
  email: string;
  role: Role;
  since: number;
}

export type SigninResult = { ok: true; role: Role } | { ok: false; error: string };

export function roleFor(email: string): Role {
  return email.trim().toLowerCase().includes("freelancer") ? "freelancer" : "client";
}

/* the session is mirrored to sessionStorage, and every read defends against a
   storage that is missing or full (private windows, embedded webviews) */
const SESSION_KEY = "vl.dash.session";

export function readSession(): Session | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed || typeof parsed.email !== "string") return null;
    return {
      email: parsed.email,
      role: parsed.role === "freelancer" ? "freelancer" : roleFor(parsed.email),
      since: typeof parsed.since === "number" ? parsed.since : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* the context still holds it for this tab */
  }
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

/* the address the demo refuses, so the failure path is testable */
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

/* the mock: "fail@" is always refused, anything else that validates is accepted.
   A successful sign-in also opens the dashboard session, which is what the
   /dashboard guard reads on the next route. */
export function signIn({ email }: SigninCredentials): SigninResult {
  if (email.trim().toLowerCase().startsWith(FAIL_PREFIX)) {
    return { ok: false, error: BAD_CREDENTIALS };
  }
  const role = roleFor(email);
  writeSession({ email: email.trim(), role, since: Date.now() });
  return { ok: true, role };
}
