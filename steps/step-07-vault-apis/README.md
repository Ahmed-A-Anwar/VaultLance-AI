# Step 7 – Vault REST APIs & Membership Lifecycle

## Overview
Step 7 exposes RESTful endpoints for creating, listing, inspecting, updating, and managing membership invitations on vaults with ownership enforcement.

---

## 1. Directory Structure

```
steps/step-07-vault-apis/
├── vaults/
│   ├── vault.schemas.ts       # Zod schemas for input validation
│   ├── vault.controller.ts    # Request handlers
│   └── vault.routes.ts        # Express routing & middleware integration
└── tests/
    └── vault.test.ts          # Complete test suite (4 tests)
```

---

## 2. API Endpoints

### 1. Create Vault: `POST /api/vaults`
- **Guards**: `requireAuth`, `requireRole('FREELANCER')`
- **Request Body**:
  ```json
  {
    "title": "Fullstack Next.js Application",
    "description": "Production e-commerce build",
    "amount": 4500,
    "currency": "USD"
  }
  ```
- **Response (201 Created)**: Returns created vault with `status: "DRAFT"` and creator automatically registered as owner.

### 2. List Vaults: `GET /api/vaults`
- **Guards**: `requireAuth`
- **Behavior**: Returns all vaults where the user is the creator (freelancer) OR an invited/accepted client.

### 3. Get Vault By ID: `GET /api/vaults/:id`
- **Guards**: `requireAuth`
- **Behavior**: Retrieves vault details, files list, and member list. Rejects non-members with `403 Forbidden`.

### 4. Update Vault: `PATCH /api/vaults/:id`
- **Guards**: `requireAuth`, `requireRole('FREELANCER')`
- **Request Body**:
  ```json
  {
    "title": "Updated Title",
    "amount": 5000,
    "status": "AWAITING_CLIENT"
  }
  ```
- **Behavior**: Validates state transition against `VaultStateMachine`.

### 5. Invite Client: `POST /api/vaults/:id/invite`
- **Guards**: `requireAuth`, `requireRole('FREELANCER')`
- **Request Body**:
  ```json
  {
    "clientEmail": "client@vaultlance.io"
  }
  ```
- **Behavior**: Links client to vault with `invitationStatus: "PENDING"` and transitions vault status from `DRAFT` to `AWAITING_CLIENT`.

### 6. Accept Invitation: `POST /api/vaults/:id/accept`
- **Guards**: `requireAuth`, `requireRole('CLIENT')`
- **Behavior**: Validates client is the invitee, marks invitation `ACCEPTED`, and transitions status to `AWAITING_AUTHORIZATION`.

---

## 3. Verification & Testing
Run tests:
```bash
npm test tests/vault.test.ts
```
Covers:
- Creating vault with initial `DRAFT` state.
- Rejecting non-positive amounts with `VALIDATION_ERROR`.
- End-to-end invitation and acceptance workflow.
- Enforcing domain state machine against illegal transitions.
