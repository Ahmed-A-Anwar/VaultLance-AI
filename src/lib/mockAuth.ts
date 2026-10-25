/* mockAuth.ts — the sign-in rules for the sandbox. Everything here is local and
   synchronous: no network, no storage, nothing to configure. Change the demo
   behavior in this one file. */

export interface SigninCredentials {
  email: string;
  password: string;
}

export type SigninResult = { ok: true } | { ok: false; error: string };

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

/* the mock: "fail@" is always refused, anything else that validates is accepted */
export function signIn({ email }: SigninCredentials): SigninResult {
  if (email.trim().toLowerCase().startsWith(FAIL_PREFIX)) {
    return { ok: false, error: BAD_CREDENTIALS };
  }
  return { ok: true };
}
