# Step 6 – Vault Domain Model & State Transition Machine

## Overview
Step 6 implements the core domain entity, state machine, and domain service representing escrow vaults. It encapsulates strict business invariants, domain validation rules, and lifecycle transitions.

---

## 1. Directory Structure

```
steps/step-06-vault-domain-model/
└── vaults/
    ├── vault.types.ts           # Domain models, DTOs, and status enums
    ├── vault.entity.ts          # Rich domain entity encapsulating validation rules
    ├── vault.state-machine.ts   # Finite state machine defining permitted transitions
    └── vault.domain-service.ts  # Domain orchestration service
```

---

## 2. Vault Status Enum & Lifecycle

The vault lifecycle contains 14 distinct states:
1. `DRAFT`: Initial draft created by freelancer.
2. `AWAITING_CLIENT`: Client invited, waiting for acceptance.
3. `AWAITING_AUTHORIZATION`: Client accepted, waiting for escrow payment authorization.
4. `AUTHORIZED`: Funds held in escrow.
5. `IN_PROGRESS`: Freelancer working on deliverables.
6. `SUBMITTED`: Deliverables submitted with cryptographic hash manifest.
7. `VERIFYING`: Automated AI / code checks running.
8. `NEEDS_REVISION`: Deliverables failed checks or need adjustment.
9. `AWAITING_APPROVAL`: Verification passed, awaiting client release approval.
10. `CAPTURE_PENDING`: Client approved, capture in-flight.
11. `PAID`: Funds captured and released to freelancer (Terminal).
12. `CANCELLED`: Cancelled prior to authorization (Terminal).
13. `EXPIRED`: Time limit reached without authorization (Terminal).
14. `DISPUTED`: Arbitration requested by either party.

---

## 3. Allowed State Transitions Map

```
DRAFT                  ──► AWAITING_CLIENT, CANCELLED
AWAITING_CLIENT        ──► AWAITING_AUTHORIZATION, CANCELLED
AWAITING_AUTHORIZATION ──► AUTHORIZED, CANCELLED, EXPIRED
AUTHORIZED             ──► IN_PROGRESS, CANCELLED
IN_PROGRESS            ──► SUBMITTED, DISPUTED
SUBMITTED              ──► VERIFYING, DISPUTED
VERIFYING              ──► AWAITING_APPROVAL, NEEDS_REVISION, DISPUTED
NEEDS_REVISION         ──► SUBMITTED, CANCELLED, DISPUTED
AWAITING_APPROVAL      ──► CAPTURE_PENDING, NEEDS_REVISION, DISPUTED
CAPTURE_PENDING        ──► PAID, DISPUTED
DISPUTED               ──► PAID, CANCELLED
PAID, CANCELLED, EXPIRED: Terminal states (no transitions allowed)
```

Illegal transitions throw an `InvalidStateTransitionError` (HTTP 409 Conflict) preventing invalid state changes (e.g. from `DRAFT` directly to `PAID`).

---

## 4. Domain Invariants & Business Rules

1. **Title Validation**: Must be non-empty, between 3 and 255 characters.
2. **Amount Validation**: Must be a positive decimal number greater than 0.
3. **Currency Validation**: Standard 3-letter currency code (default: USD).
4. **Immutability After Agreement**: Vault financial terms (amount, currency) cannot be altered once contract or payment is authorized.
