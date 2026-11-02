# Step 10 – Frontend Integration, API Client & DEMO_MODE

## Overview
Step 10 connects the React frontend directly to the Node.js/Express backend API via a strongly typed API client, removes in-memory store dependencies for real deployments, introduces comprehensive loading/empty/error states, and retains instant offline capabilities behind the `DEMO_MODE` toggle.

---

## 1. Directory Structure

```
steps/step-10-frontend-integration/
└── lib/
    ├── apiClient.ts      # Typed REST API Client with token storage and error mapping
    ├── mockAuth.ts       # Unified authentication coordinator with DEMO_MODE toggle
    └── api.ts            # Dashboard seam connecting UI queries to the backend
```

---

## 2. Key Components

### 1. `ApiClient` (`src/lib/apiClient.ts`)
- Configured to connect to `VITE_API_URL` (defaults to `http://localhost:3000/api`).
- Automatically handles Authorization headers:
  ```ts
  headers["Authorization"] = `Bearer ${this.getToken()}`;
  ```
- Modular API services:
  - `apiClient.auth.*` (login, register, logout, me)
  - `apiClient.vaults.*` (create, list, getById, update, invite, accept)
  - `apiClient.uploads.*` (uploadFile, getDownloadUrl)
  - `apiClient.manifests.*` (get, verify)

### 2. Demo Mode Toggle (`DEMO_MODE`)
- Controlled via:
  - Environment variable: `VITE_DEMO_MODE=true`
  - URL query parameter: `?demo=1` or `?demo=true`
  - LocalStorage toggle: `localStorage.setItem('vl_demo_mode', 'true')`
- When Demo Mode is **enabled**:
  - The frontend operates offline, using local synchronous fixtures and simulated network latency for testing or client presentations.
- When Demo Mode is **disabled** (Default Production Mode):
  - The frontend communicates directly with the backend API.
  - Returns real database records and stores cryptographic session tokens.

### 3. Comprehensive State Handling
- **Loading States**: Displayed during asynchronous network calls (e.g. `checking` spinner on login, loading skeletons on dashboard).
- **Empty States**: Supported on vault listings (e.g. `?empty=1` or when user has 0 vaults created).
- **Success States**: Toasts, dynamic badge transitions, and route advances.
- **Error States**: Mapped from backend `error.code` (e.g. `INVALID_CREDENTIALS`, `FORBIDDEN`, `VALIDATION_ERROR`) with user-friendly error banners and inline field errors.
