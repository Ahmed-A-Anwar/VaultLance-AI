/* vaultAdapter.ts — map a backend vault/project/order record onto the
   dashboard's Vault and VaultDetail shapes.

   DELIBERATELY UNWIRED: no logic here. Wire happens behind FX.real flags,
   reads with an "OFFLINE DEMO DATA" fallback chip, writes failing loudly.
   See docs/fastapi-backend-map.md §b/§d for every row and its verdict. */

import type { UiStatus } from "./statusMap";

/* the dashboard's own shapes (src/lib/api.ts) */
export interface UiVault {
  id: string;
  project: string;
  freelancer: string;
  amountUSD: number;
  status: UiStatus;
  createdAt: number;
  paypalOrderId?: string;
}

/* Express: a vault row with members (GET /api/vaults, vault.actions.ts) */
export interface ExpressVault {
  id: string;
  freelancerId: string;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  members?: Array<{ id: string; userId: string; email?: string; fullName?: string; role: string }>;
}

/* FastAPI: a project row (schemas/project.py: ProjectOut) */
export interface FastProject {
  id: string; // uuid
  title: string;
  brief: string;
  status: string;
  agreement_version: number;
  client_approved_criteria: boolean;
  freelancer_approved_criteria: boolean;
  created_at: string;
}

/* FastAPI: a PayPal order row (app/models/paypal_order.py, via GET /paypal/orders/{id}) */
export interface FastOrder {
  internal_status: string;
  paypal_status: string | null;
  amount: number;
  currency: string;
  human_release_approved: boolean;
}

/* TODO(wire): expressVaultToUi — members → freelancer name, status via statusMap
   TODO(wire): fastProjectToUi — brief → description?, NO amount field → pair with
     a FastOrder (order.amount) or a vault-amount endpoint (currently a gap)
   TODO(wire): fastOrderToUi — internal_status via statusMap, amount is the money
   TODO(wire): joinByCode — the UI joins by invite code; both backends accept by
     vault/project id, so the code→id lookup is a backend gap (doc §e) */
export type VaultAdapter = {
  expressToUi: (v: ExpressVault) => UiVault;
  projectToUi: (p: FastProject, order?: FastOrder) => UiVault;
  orderToUi: (o: FastOrder, project: FastProject) => void; // partial record, not enough alone
};
