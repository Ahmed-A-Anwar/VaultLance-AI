/* authApi.ts — the account calls the whole app makes, in one place.

   With FX.real.auth on, every call here goes through src/lib/http.ts: the
   server's short message is the error, the bearer token it returns is kept in
   memory, and a 401 on sign-in stays an inline answer (skipUnauthorized) rather
   than a redirect. With the flag off, the same functions keep the behaviour the
   app shipped with, so nothing changes until the slice is switched on.

   No function here reveals whether an address has an account: the reset request
   answers the server's generic sentence either way. */

import { apiClient } from "./apiClient";
import { request, setAccessToken } from "./http";
import { realOn } from "../config/fx";

export type ServerRole = "FREELANCER" | "CLIENT";

export interface ServerUser {
  id: string;
  email: string;
  fullName: string;
  role: ServerRole;
  avatarUrl?: string | null;
  createdAt?: string;
}

export interface AuthSessionPayload {
  user: ServerUser;
  token: string;
  sessionId?: string;
  expiresIn?: string;
}

const real = () => realOn("auth");

/* Sign-in and registration are the first request after the Fly machine wakes,
   and a cold start can outlast the 10s default long after the API itself has
   answered: the account gets created while the browser has already given up.
   These calls get a deadline that survives a cold start. */
const AUTH_TIMEOUT_MS = 45_000;

/** The API hands the token back once; it goes straight into memory. */
function remember(payload: AuthSessionPayload): AuthSessionPayload {
  if (payload?.token) setAccessToken(payload.token);
  return payload;
}

const failure = (message?: string): never => {
  throw new Error(message || "Something went wrong. Try again.");
};

export async function login(email: string, password: string): Promise<AuthSessionPayload> {
  if (!real()) {
    const res = await apiClient.auth.login({ email, password });
    if (!res.success || !res.data) return failure(res.message);
    return remember(res.data as AuthSessionPayload);
  }
  return remember(
    await request<AuthSessionPayload>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipUnauthorized: true,
      timeoutMs: AUTH_TIMEOUT_MS,
    })
  );
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  role: ServerRole;
}

export async function register(input: RegisterInput): Promise<AuthSessionPayload> {
  if (!real()) {
    const res = await apiClient.auth.register(input);
    if (!res.success || !res.data) return failure(res.message);
    return remember(res.data as AuthSessionPayload);
  }
  return remember(
    await request<AuthSessionPayload>("/auth/register", {
      method: "POST",
      body: input,
      skipUnauthorized: true,
      timeoutMs: AUTH_TIMEOUT_MS,
    })
  );
}

/** The server revokes the session row; the caller clears the local copy after. */
export async function logout(): Promise<void> {
  if (!real()) {
    await apiClient.auth.logout().catch(() => undefined);
    return;
  }
  if (!apiClient.getToken()) return;
  await request<{ loggedOut: boolean }>("/auth/logout", { method: "POST" }).catch(() => undefined);
}

export async function me(): Promise<ServerUser> {
  if (!real()) {
    const res = await apiClient.me.get();
    if (!res.success || !res.data) return failure(res.message);
    return res.data as ServerUser;
  }
  return request<ServerUser>("/auth/me");
}

/* password reset: the same three steps the screens already walk through */

export async function requestPasswordReset(email: string): Promise<{ sent: boolean; devResetUrl: string | null }> {
  if (!real()) {
    const res = await apiClient.auth.requestPasswordReset(email);
    if (!res.success) return failure(res.message);
    return { sent: true, devResetUrl: res.data?.devResetUrl ?? null };
  }
  return request("/auth/password-reset/request", {
    method: "POST",
    body: { email },
    skipUnauthorized: true,
  });
}

export async function inspectPasswordReset(token: string): Promise<"valid" | "expired" | "invalid"> {
  if (!real()) {
    const res = await apiClient.auth.inspectPasswordReset(token);
    const state = String(res.data?.state ?? "");
    return state === "valid" || state === "expired" ? state : "invalid";
  }
  const data = await request<{ state: string }>(`/auth/password-reset/${encodeURIComponent(token)}`);
  return data.state === "valid" || data.state === "expired" ? data.state : "invalid";
}

export async function confirmPasswordReset(proof: { token?: string; accessToken?: string; password: string }): Promise<void> {
  if (!real()) {
    const res = await apiClient.auth.confirmPasswordReset(proof);
    if (!res.success) return failure(res.message);
    return;
  }
  await request("/auth/password-reset/confirm", { method: "POST", body: proof, skipUnauthorized: true });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!real()) {
    const res = await apiClient.me.changePassword({ currentPassword, newPassword });
    if (!res.success) return failure(res.message);
    return;
  }
  await request("/auth/me/password", { method: "POST", body: { currentPassword, newPassword } });
}

/** 409 carries the server's blocking reason; the caller shows it as-is. */
export async function deleteAccount(email: string): Promise<void> {
  if (!real()) {
    const res = await apiClient.me.remove({ email });
    if (!res.success) return failure(res.message);
    return;
  }
  await request("/auth/me", { method: "DELETE", body: { email } });
}
