# Step 5 – Role-Based Authorization & Tenant Data Isolation

## Overview
Step 5 enforces strict Role-Based Access Control (RBAC) and Cross-Tenant Data Isolation, ensuring users can only perform actions permitted for their role (`FREELANCER` or `CLIENT`) and completely preventing any user from accessing, modifying, or enumerating another user's vaults or deliverables.

---

## 1. Directory Structure

```
steps/step-05-role-based-authorization/
├── authorization/
│   ├── roles.ts                 # Role definitions: FREELANCER | CLIENT
│   ├── permissions.ts           # Permission mapping matrix
│   ├── role.middleware.ts       # Role-checking Express middleware
│   └── isolation.service.ts     # Data isolation & IDOR prevention service
└── tests/
    └── authorization.test.ts    # Comprehensive test suite (4 tests)
```

---

## 2. Roles & Permissions Matrix

| Capability / Action | FREELANCER | CLIENT |
| :--- | :---: | :---: |
| **Create Vault** (`POST /api/vaults`) | ✅ Yes | ❌ No (403 Forbidden) |
| **List My Vaults** (`GET /api/vaults`) | ✅ Owned Vaults | ✅ Member Vaults |
| **View Vault Details** (`GET /api/vaults/:id`) | ✅ Only if Owner | ✅ Only if Invited Member |
| **Update Vault** (`PATCH /api/vaults/:id`) | ✅ Only if Owner | ❌ No (403 Forbidden) |
| **Invite Client** (`POST /api/vaults/:id/invite`) | ✅ Only if Owner | ❌ No (403 Forbidden) |
| **Accept Invitation** (`POST /api/vaults/:id/accept`) | ❌ No | ✅ Only Invited Client |
| **Upload Deliverables** (`POST /api/uploads/:id`) | ✅ Only if Owner | ❌ No (403 Forbidden) |

---

## 3. Data Isolation & IDOR Defense (منع المستخدم من الوصول لبيانات مستخدم آخر)

- **Owner Isolation**: When a user queries a vault ID (`/api/vaults/:id`), `DataIsolationService.getVaultIfAuthorized(userId, vaultId)` checks if the caller is the registered `freelancer_id` or an invited client in `vault_members`.
- **Third-Party Defense**: If an unrelated user attempts to access or modify a vault ID, the request is immediately blocked with `403 Forbidden` (`CROSS_TENANT_ACCESS_DENIED` or `OWNERSHIP_REQUIRED`).
- **Query Isolation**: The vault list endpoint strictly limits results to `vault.freelancer_id === userId || member.user_id === userId`. Users can never see records belonging to other tenants.

---

## 4. Verification & Testing
Run the tests:
```bash
npm test tests/authorization.test.ts
```
Covers:
- `requireRole('FREELANCER')` denies clients with 403.
- Cross-tenant vault viewing denial (403 `CROSS_TENANT_ACCESS_DENIED`).
- Cross-tenant vault modification denial (403 `OWNERSHIP_REQUIRED`).
- Legitimate invited client access approval once invited.
