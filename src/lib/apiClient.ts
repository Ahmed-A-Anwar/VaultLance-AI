/**
 * VaultLance / VaultPay Frontend API Client
 * Connects frontend to the backend REST API
 */

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

  /* The session object is the only place that knows both who is signed in and
     which token belongs to them — and it is what the UI reads its role from. A
     token left in vl_token by an earlier sign-in (another account, another
     tab) used to be sent instead, so the dashboard showed one user's role while
     the API ran as the other and answered 403 with "Current role: 'CLIENT'". */
  private sessionToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
      const raw =
        window.sessionStorage.getItem("vl.dash.session") ||
        window.localStorage.getItem("vl.dash.session");
      if (!raw) return null;
      const token = (JSON.parse(raw) as { token?: unknown }).token;
      return typeof token === "string" && token ? token : null;
    } catch {
      return null;
    }
  }

  public getToken(): string | null {
    if (typeof window === "undefined") return null;
    return (
      this.sessionToken() ||
      window.localStorage.getItem("vl_token") ||
      window.sessionStorage.getItem("vl_token")
    );
  }

  public setToken(token: string, persist: boolean = true): void {
    if (typeof window === "undefined") return;
    if (persist) {
      window.localStorage.setItem("vl_token", token);
    }
    window.sessionStorage.setItem("vl_token", token);
  }

  public clearToken(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("vl_token");
    window.sessionStorage.removeItem("vl_token");
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
