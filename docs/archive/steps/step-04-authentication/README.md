# Step 4 – Authentication & Password Hashing & Secure Sessions

## Overview
Step 4 implements a production-grade, secure authentication system featuring password hashing with bcrypt, JWT token issuance with cryptographic signatures, and stateful session tracking with active revocation capability.

---

## 1. Architecture & Components

```
steps/step-04-authentication/
├── auth/
│   ├── auth.controller.ts    # HTTP request/response handlers
│   ├── auth.service.ts       # Business logic (registration, credential validation, sessions)
│   ├── auth.routes.ts        # Express router with rate limiting
│   ├── auth.schemas.ts       # Strict input validation via Zod
│   ├── password.ts           # bcrypt hashing with 12 salt rounds
│   ├── jwt.ts                # Token signing & verification with HS256
│   └── session.store.ts      # Active session store & revocation management
├── middleware/
│   └── auth.middleware.ts    # Bearer token verification & session validation
└── tests/
    └── auth.test.ts          # Comprehensive test suite (7 tests)
```

---

## 2. Security Guarantees

1. **Password Hashing (bcrypt)**
   - Salt rounds configured to `12`.
   - Never stores plain-text passwords or hashes without random per-password salting.
   - Resistant to rainbow table attacks and GPU-accelerated brute force.

2. **Session / JWT Management**
   - JWT payload contains: `{ userId, email, role, fullName, sessionId }`.
   - Signed using `HS256` with a strong secret key.
   - Dual-layer validation: Verifies cryptographic JWT signature **AND** verifies that `sessionId` is active in `SessionStore`.
   - On user logout, the session is flagged as `revoked: true`, immediately invalidating the JWT across all nodes before its expiration time.

3. **Rate Limiting**
   - Sliding-window rate limiter on auth routes (login/register) to prevent credential stuffing and brute-force attacks.

---

## 3. Endpoints Specification

### `POST /api/auth/register`
- **Request Body**:
  ```json
  {
    "email": "developer@vaultlance.io",
    "password": "StrongPassword123!",
    "fullName": "Alice Developer",
    "role": "FREELANCER"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Account registered successfully",
    "data": {
      "user": {
        "id": "e44d82ec-fa6c-48b4-92ee-48cbb33658dc",
        "email": "developer@vaultlance.io",
        "fullName": "Alice Developer",
        "role": "FREELANCER"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "sessionId": "b3e0dc80-99c5-4309-80e9-bbf853c07213",
      "expiresIn": "7d"
    }
  }
  ```

### `POST /api/auth/login`
- **Request Body**:
  ```json
  {
    "email": "developer@vaultlance.io",
    "password": "StrongPassword123!"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Logged in successfully",
    "data": {
      "user": { ... },
      "token": "eyJhbGciOiJIUzI1Ni...",
      "sessionId": "...",
      "expiresIn": "7d"
    }
  }
  ```

### `GET /api/auth/me`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**: Current authenticated user profile.

### `POST /api/auth/logout`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**: Revokes active session.

---

## 4. Verification & Testing
Run the test suite:
```bash
npm test tests/auth.test.ts
```
Covers:
- Successful registration with hashed password check.
- Duplicate email prevention (409 Conflict).
- Password length and entropy validation (400 Bad Request).
- Correct credentials login.
- Incorrect password rejection (401 Unauthorized).
- Bearer token authentication guard.
- Session revocation on logout.
