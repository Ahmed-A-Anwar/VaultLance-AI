/**
 * VaultLance / VaultPay Frontend API Client
 * Connects frontend to the backend REST API
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const isDemoMode = (): boolean => {
  if (typeof window === "undefined") return false;
  const urlParam = new URLSearchParams(window.location.search).get("demo");
  if (urlParam === "1" || urlParam === "true") return true;
  return (
    import.meta.env.VITE_DEMO_MODE === "true" ||
    window.localStorage.getItem("vl_demo_mode") === "true"
  );
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

  public getToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("vl_token") || window.sessionStorage.getItem("vl_token");
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
