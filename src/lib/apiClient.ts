/**
 * VaultLance / VaultPay Frontend API Client
 * Connects frontend to the backend REST API
 */

import { clearAccessToken, configureHttp, getAccessToken, setAccessToken } from "./http";
import { realOn } from "../config/fx";
import { demoBuildEnabled } from "./demoGate";

const explicitApiUrl = (import.meta.env.VITE_API_URL || "").trim();

/*
 * Where the API lives. An explicit VITE_API_URL always wins; a production build
 * without one talks to its own origin, so a deployment can serve or proxy /api;
 * only the dev server defaults to the local Express app. Pointing a shipped
 * bundle at localhost is what made the deployed signup fail with "Failed to
 * fetch": localhost in a visitor's browser is the visitor's machine.
 */
export const API_BASE_URL =
  explicitApiUrl || (import.meta.env.PROD ? "/api" : "http://localhost:3000/api");

/** True when this build has an API to talk to (dev, or VITE_API_URL set). */
export const hasApiConfigured = (): boolean =>
  Boolean(explicitApiUrl) || !import.meta.env.PROD;

/** May a surface offer the demo hold, which marks a vault held without any money
    moving? Only in a build that is not production, or one with no API to hold
    money in. Deliberately not isDemoMode(): `?demo=1` and a localStorage key are
    visitor-controlled, so they must not be able to turn a fake hold back on. */
export const mockHoldAllowed = (): boolean => !import.meta.env.PROD || !hasApiConfigured();

export const isDemoMode = (): boolean => {
  if (typeof window === "undefined") return false;
  /* A production build ignores ?demo=1 and the localStorage flag unless it was
     built with VITE_ENABLE_DEMO=true. The query parameter is visitor-controlled,
     so it must never be able to open a fabricated signed-in shell. */
  if (!demoBuildEnabled()) return false;
  const urlParam = new URLSearchParams(window.location.search).get("demo");
  if (urlParam === "1" || urlParam === "true") return true;
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  return window.localStorage.getItem("vl_demo_mode") === "true";
};

export const setDemoMode = (enabled: boolean): void => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("vl_demo_mode", enabled ? "true" : "false");
  }
};

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code?: string;
    details?: any;
  };
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /* The token lives in src/lib/http.ts and nowhere else, which keeps it in
     sessionStorage for the life of the tab (never localStorage, never a URL), so
     a reload keeps the session and closing the tab ends it.

     main fixed a real bug here (PR #19): the token and the role came from
     different places, so after a second sign-in the API ran as one account while
     the dashboard showed another. Reading the token from the stored session is
     one answer; this branch makes the split impossible instead — the same
     sign-in sets the role and the token, the stored session carries no token,
     and there is exactly one place the token lives. */
  public getToken(): string | null {
    return getAccessToken();
  }

  public setToken(token: string, _persist: boolean = true): void {
    setAccessToken(token);
  }

  public clearToken(): void {
    /* a token an older build left in storage is removed on the way through */
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("vl_token");
      window.sessionStorage.removeItem("vl_token");
    }
    clearAccessToken();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const token = this.getToken();

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const json = await response.json().catch(() => ({
        success: false,
        message: response.statusText,
      }));

      if (!response.ok) {
        /* A 401 on a request that carried a token means the session is gone:
           the shell clears it and returns to /signin. A 401 with no token is a
           rejected sign-in, which must stay an inline error instead. */
        if (response.status === 401 && token) {
          window.dispatchEvent(new CustomEvent("vl:unauthorized"));
        }
        return {
          success: false,
          message: json.message || `Request failed with status ${response.status}`,
          error: json.error || { code: `HTTP_${response.status}` },
        };
      }

      return json;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Network request failed. Is the backend server running?",
        error: { code: "NETWORK_ERROR", details: err },
      };
    }
  }

  // --- Auth APIs ---
  public auth = {
    register: (dto: { email: string; password: string; fullName: string; role: string }) =>
      this.request<{ user: any; token: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(dto),
      }),

    login: (dto: { email: string; password: string }) =>
      this.request<{ user: any; token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(dto),
      }),

    logout: () =>
      this.request("/auth/logout", {
        method: "POST",
      }),

    me: () => this.request<any>("/auth/me", { method: "GET" }),

    /* password reset — no session required */
    requestPasswordReset: (email: string) =>
      this.request<{ sent: boolean; devResetUrl: string | null }>("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),

    inspectPasswordReset: (token: string) =>
      this.request<{ state: "valid" | "expired" | "invalid" }>(
        `/auth/password-reset/${encodeURIComponent(token)}`,
        { method: "GET" }
      ),

    confirmPasswordReset: (dto: { token?: string; accessToken?: string; password: string }) =>
      this.request<{ changed: boolean }>("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
  };

  // --- Vault APIs ---
  public vaults = {
    create: (dto: { title: string; description?: string; amount: number; currency?: string }) =>
      this.request<any>("/vaults", {
        method: "POST",
        body: JSON.stringify(dto),
      }),

    list: () => this.request<any[]>("/vaults", { method: "GET" }),

    getById: (id: string) => this.request<any>(`/vaults/${id}`, { method: "GET" }),

    update: (id: string, dto: { title?: string; description?: string; amount?: number; status?: string }) =>
      this.request<any>(`/vaults/${id}`, {
        method: "PATCH",
        body: JSON.stringify(dto),
      }),

    invite: (id: string, clientEmail: string) =>
      this.request<any>(`/vaults/${id}/invite`, {
        method: "POST",
        body: JSON.stringify({ clientEmail }),
      }),

    accept: (id: string) =>
      this.request<any>(`/vaults/${id}/accept`, {
        method: "POST",
      }),

    /* POST /vaults/:id/invite-code — mints VL-XXXX-XXXX, single use, 7 days */
    inviteCode: (id: string) =>
      this.request<{ vaultId: string; code: string; expiresAt: string }>(
        `/vaults/${id}/invite-code`,
        { method: "POST" }
      ),

    /* POST /vaults/join { code } — the client holds the code, never the vault id */
    joinByCode: (code: string) =>
      this.request<{ vaultId: string; joined: boolean; status?: string }>("/vaults/join", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
  };

  // --- Account APIs ---
  public me = {
    get: () => this.request<any>("/auth/me", { method: "GET" }),

    updateProfile: (dto: { fullName: string }) =>
      this.request<any>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify(dto),
      }),

    changePassword: (dto: { currentPassword: string; newPassword: string }) =>
      this.request<any>("/auth/me/password", {
        method: "POST",
        body: JSON.stringify(dto),
      }),

    export: () => this.request<any>("/auth/me/export", { method: "GET" }),

    remove: (dto: { email: string }) =>
      this.request<{ deleted: boolean }>("/auth/me", {
        method: "DELETE",
        body: JSON.stringify(dto),
      }),
  };

  // --- Ledger APIs ---
  public ledger = {
    /* The server now filters this to the caller's own vaults, so the gate is a
       kill switch rather than the thing keeping strangers' rows out. Three
       surfaces reach the ledger through here — the client's dashboard, the
       freelancer's Earnings and both Payments readers — so switching it off here
       still silences all of them at once. See docs/decisions.md. */
    list: async (): Promise<ApiResponse<any[]>> => {
      if (!realOn("events")) return { success: true, message: "Ledger reads are switched off.", data: [] };
      return this.request<any[]>("/ledger", { method: "GET" });
    },
  };

  // --- Upload & File APIs ---
  public uploads = {
    uploadFile: (vaultId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return this.request<any>(`/uploads/${vaultId}`, {
        method: "POST",
        body: formData,
      });
    },

    list: (vaultId: string) => this.request<any[]>(`/uploads/vault/${vaultId}/files`, { method: "GET" }),

    getDownloadUrl: (fileId: string) => `${this.baseUrl}/uploads/download/${fileId}`,
  };

  // --- Manifest APIs ---
  public manifests = {
    get: (vaultId: string) => this.request<any>(`/manifests/${vaultId}`, { method: "GET" }),

    verify: (vaultId: string) =>
      this.request<any>(`/manifests/${vaultId}/verify`, { method: "POST" }),
  };
}

export const apiClient = new ApiClient();

/* the http client takes its base from the same rules, and from nowhere else */
configureHttp(API_BASE_URL);
