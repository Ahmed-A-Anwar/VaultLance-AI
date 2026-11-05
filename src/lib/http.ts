/* http.ts — the one place the browser talks to the Express API.
 *
 * One fetch wrapper: JSON in and out, a 10s default timeout (uploads pass 30s),
 * an AbortController, and typed errors carrying the server's short message plus
 * a request id when the API sends one. Nothing here logs a token, a cookie or a
 * response body: the error objects hold a message and a status, never a payload.
 *
 * The access token lives in this module and nowhere else. It is a bearer token
 * (the API sets no cookies), so it is kept in memory only: a reload forgets it
 * and the session has to sign in again. It is never written to localStorage,
 * sessionStorage, the URL or a log.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
export const UPLOAD_TIMEOUT_MS = 30_000;

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** The request never reached the API, or it timed out. */
export class NetworkError extends HttpError {
  constructor(message = "The request did not reach the server.") {
    super(message, 0, "NETWORK_ERROR");
  }
}
export class AuthError extends HttpError {}
export class ForbiddenError extends HttpError {}
export class ConflictError extends HttpError {}
export class ValidationError extends HttpError {}
export class ServerError extends HttpError {}

/* ------------------------------------------------------------- the token --- */

/* The base url is injected by apiClient, which owns the VITE_API_URL rules.
   Injecting it instead of importing keeps this module free of a cycle. */
let httpBase = "/api";
export const configureHttp = (baseUrl: string): void => {
  httpBase = baseUrl.replace(/\/$/, "");
};

let accessToken: string | null = null;

export const getAccessToken = (): string | null => accessToken;
export const setAccessToken = (token: string | null): void => {
  accessToken = token && token.trim() ? token : null;
};
export const clearAccessToken = (): void => {
  accessToken = null;
};

/* --------------------------------------------------- the 401 door, once --- */

type UnauthorizedHandler = () => void;
let onUnauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered once by the app shell; called when a request answers 401. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  onUnauthorizedHandler = fn;
}

/* --------------------------------------------------------------- requests --- */

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** multipart upload — the browser sets the boundary, so no JSON header */
  form?: FormData;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** sign-in and other public auth calls: a 401 is an answer, not a lost session */
  skipUnauthorized?: boolean;
}

function urlOf(path: string): string {
  return `${httpBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function errorFor(status: number, message: string, code?: string, requestId?: string): HttpError {
  if (status === 401) return new AuthError(message, status, code, requestId);
  if (status === 403) return new ForbiddenError(message, status, code, requestId);
  if (status === 409) return new ConflictError(message, status, code, requestId);
  if (status === 400 || status === 422) return new ValidationError(message, status, code, requestId);
  if (status >= 500) return new ServerError(message, status, code, requestId);
  return new HttpError(message, status, code, requestId);
}

/** One request. Resolves with the API's `data`, or throws a typed HttpError. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(urlOf(path), {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
      /* bearer only: the API sets no cookies, so none are sent */
      credentials: "omit",
    });
  } catch {
    throw new NetworkError(
      controller.signal.aborted ? "The server took too long to answer." : undefined
    );
  } finally {
    window.clearTimeout(timeout);
  }

  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message =
      (json && typeof json.message === "string" && json.message) ||
      `Request failed with status ${res.status}.`;
    const code = json?.error?.code ? String(json.error.code) : undefined;
    const requestId =
      (json?.error?.requestId && String(json.error.requestId)) ||
      res.headers.get("x-request-id") ||
      undefined;
    const error = errorFor(res.status, message, code, requestId);

    if (error instanceof AuthError && !opts.skipUnauthorized) {
      clearAccessToken();
      onUnauthorizedHandler?.();
    }
    throw error;
  }

  /* every API success is { success, message, data } */
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}
