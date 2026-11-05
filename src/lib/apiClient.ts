/**
 * VaultLance / VaultPay Frontend API Client
 * Connects frontend to the backend REST API
 */

import { clearAccessToken, configureHttp, getAccessToken, setAccessToken } from "./http";

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
  const urlParam = new URLSearchParams(window.location.search).get("demo");
  if (urlParam === "1" || urlParam === "true") return true;
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  if (window.localStorage.getItem("vl_demo_mode") === "true") return true;
  /* a production build with no API configured has nothing to authenticate
     against, so it runs the local demo instead of posting into the void */
  return import.meta.env.PROD && !explicitApiUrl;
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

  /* The token lives in memory (src/lib/http.ts) and nowhere else. It is never
     written to localStorage, sessionStorage or a URL, so a reload signs in
     again rather than leaving a bearer token behind on the disk. */
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
    list: () => this.request<any[]>("/ledger", { method: "GET" }),
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
