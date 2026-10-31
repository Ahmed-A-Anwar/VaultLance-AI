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

/* ---- password reset (mock) ----
   Local only, like everything else in this file. Each function is named after the
   call it will make once the backend exists:

     requestReset(email)            -> POST /v1/auth/forgot-password
     verifyResetToken(token)        -> GET  /v1/auth/reset-password/validate
     resetPassword(token, password) -> POST /v1/auth/reset-password

   Nothing here says whether an address has an account: the request screen has to
   answer the same way either way. */

export const RESEND_SECONDS = 55;
export const RESET_LINK_MINUTES = 30;
/* the link the dev banner under the card opens */
export const MOCK_RESET_LINK = "/reset-password?token=demo-valid";

export const RESET_EMAIL_EMPTY = "Enter your email.";
export const RESET_EMAIL_BAD = "Enter a valid email address.";
export const RESET_SEND_ERROR = "Couldn't send. Try again.";
export const RESET_TOO_MANY = `Too many attempts. Try again in ${RESEND_SECONDS} seconds.`;
export const RESET_MISMATCH = "Passwords don't match.";
export const MAX_RESET_SENDS = 3;

/* the reset screen asks for the same address rule, with its own empty message */
export function resetEmailError(value: string): string | null {
  if (!value.trim()) return RESET_EMAIL_EMPTY;
  return EMAIL_RE.test(value.trim()) ? null : RESET_EMAIL_BAD;
}

/* how many requests this tab has made: three is the sandbox's limit */
let resetSends = 0;
export const resetSendCount = () => resetSends;
export const noteResetSend = () => (resetSends += 1);

/* the answer is always the same, and it never names an account */
export function requestReset(email: string): { ok: true } | { ok: false; error: string } {
  /* the address is what the real call will send; nothing local reads it */
  void email;
  return { ok: true };
}

export type ResetTokenState = "valid" | "expired" | "invalid";

/* demo-valid and demo-expired are the two readable tokens; anything else is
   refused, including no token at all */
export function verifyResetToken(token: string | null): ResetTokenState {
  if (token === "demo-valid") return "valid";
  if (token === "demo-expired") return "expired";
  return "invalid";
}

export function resetPassword(
  token: string | null,
  password: string
): { ok: true } | { ok: false; error: string } {
  const state = verifyResetToken(token);
  if (state !== "valid") {
    return { ok: false, error: state === "expired" ? "This link has expired." : "This link isn't valid." };
  }
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
  }
  return { ok: true };
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
