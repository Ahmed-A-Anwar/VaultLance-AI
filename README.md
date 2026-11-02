# VaultLance AI — Production Implementation (Steps 4 to 11)

Welcome to the complete, professional implementation of **VaultLance AI**, covering all requirements from Step 4 through Step 11.

---

## 📂 Project Architecture

```
VaultLance-AI/
├── backend/
│   ├── src/
│   │   ├── auth/              # Step 4: Register, Login, bcrypt, JWT & session storage
│   │   ├── authorization/     # Step 5: Roles, middleware, cross-tenant isolation
│   │   ├── vaults/            # Step 6 & 7: Vault entity, state machine, REST APIs
│   │   ├── uploads/           # Step 8: Multipart upload, Zip Slip & Zip Bomb defense
│   │   ├── manifests/         # Step 9: Canonical JSON, SHA-256 reproducibility
│   │   ├── middleware/        # Centralized auth, role, validation & error handlers
│   │   ├── shared/            # Config, types, logger, standardized responses, DB layer
│   │   ├── app.ts             # Express application configuration
│   │   └── index.ts           # Server bootstrap
│   └── tests/                 # Step 11: 26 automated unit & integration tests
│
├── src/                       # Step 10: Frontend React 19 application
│   ├── lib/
│   │   ├── apiClient.ts       # Typed API client connecting to backend
│   │   ├── mockAuth.ts        # Unified auth coordinator with DEMO_MODE toggle
│   │   └── api.ts             # UI data seam
│
├── steps/                     # Dedicated folders for every single step
│   ├── step-04-authentication/
│   ├── step-05-role-based-authorization/
│   ├── step-06-vault-domain-model/
│   ├── step-07-vault-apis/
│   ├── step-08-secure-file-upload/
│   ├── step-09-manifest-sha256/
│   ├── step-10-frontend-integration/
│   └── step-11-testing-handoff/
│
└── VaultLance-AI-Steps-4-to-11-Delivery.zip # Complete packaged delivery
```

---

## 🚀 Quick Start Guide

### 1. Run the Backend API Server
```bash
cd backend
npm install
npm run dev
# Server will listen on http://localhost:3000
```

### 2. Run the Automated Test Suite (26 tests)
```bash
cd backend
npm test
```

### 3. Run the Frontend Development Server
```bash
# In the project root
npm install
npm run dev
# Frontend will be accessible at http://localhost:5173
```

---

## 🔒 Security Highlights

1. **Password Hashing (bcrypt)**: Uses 12 salt rounds, timing-safe validation, and enforces strict minimum password length.
2. **Dual-Layer Session / JWT**: Cryptographic HS256 JWT tokens paired with an active session store for instant server-side revocation on logout.
3. **Data Isolation (Cross-Tenant Defense)**: Prevents IDOR attacks; users can never inspect or alter vaults where they are not an authorized participant.
4. **Finite State Machine**: Validates all 14 lifecycle states; prohibits illegal state jumps (e.g. `DRAFT` cannot skip directly to `PAID`).
5. **Upload & ZIP Defense**:
   - Strictly enforces file size limits (50MB) and MIME allowlists.
   - Prevents double-extension injection (`.exe.zip`).
   - Deep ZIP header inspection: Rejects Zip Slip directory traversal attacks (`../`).
   - Zip Bomb defense: Inspects compression ratio per entry (rejects > 100:1).
   - Generates cryptographically secure, randomized object keys (`vault-<id>-<uuid>.<ext>`) stored in private directories.
6. **Canonical Manifest**: Deterministic serialization with stable identifier sorting, enabling 100% bit-for-bit SHA-256 reproducibility.
7. **Frontend Seamless Integration**: Real backend API calls with automatic session recovery and an instant `DEMO_MODE` toggle (`?demo=1`).
