/* routeTable.tsx — the dashboard's one route table. Every /dashboard path and
   the component each role gets there lives in this record; there is no default
   branch to fall through anywhere.

   A path with no component for the signed-in role renders NotAvailable in the
   shell; a path that is not in the table at all renders NotFound. Neither of
   them ever renders the Overview. */

import { lazy, type ComponentType } from "react";
import { FX } from "../../config/fx";
import type { Role } from "../../lib/mockAuth";

/* the client's five areas, unchanged */
const Overview = lazy(() => import("./Overview"));
const Vaults = lazy(() => import("./VaultsPage"));
const Ledger = lazy(() => import("./LedgerPage"));
/* FX.paymentsPage decides which client payments surface sits on the route */
const ClientPayments = lazy(() => import("./payments/PaymentsPage"));
const PaymentsPlaceholder = lazy(() => import("./Payments"));
const ClientSettings = lazy(() => import("./settings/SettingsPage"));

/* the freelancer's five areas: one component per route. Settings arrives with
   the freelancer settings slice; until then the row has no component and the
   shell shows NotAvailable — never the Overview. */
const FOverview = lazy(() =>
  import("./freelancer/FreelancerDashboard").then((m) => ({ default: m.FOverview }))
);
const FVaults = lazy(() =>
  import("./freelancer/FreelancerDashboard").then((m) => ({ default: m.FVaults }))
);
const FEarnings = lazy(() =>
  import("./freelancer/FreelancerDashboard").then((m) => ({ default: m.FEarnings }))
);
const FPayments = lazy(() =>
  import("./freelancer/FreelancerDashboard").then((m) => ({ default: m.FPayments }))
);

export type DashPath =
  | "/dashboard"
  | "/dashboard/vaults"
  | "/dashboard/ledger"
  | "/dashboard/payments"
  | "/dashboard/settings";

export interface RouteEntry {
  client: ComponentType | null;
  freelancer: ComponentType | null;
}

/* one row per path, both roles named. PaymentsPlaceholder keeps the pre-payments
   placeholder reachable for the client when FX.paymentsPage is false. */
export const DASH_ROUTES: Record<DashPath, RouteEntry> = {
  "/dashboard": { client: Overview, freelancer: FOverview },
  "/dashboard/vaults": { client: Vaults, freelancer: FVaults },
  "/dashboard/ledger": { client: Ledger, freelancer: FEarnings },
  "/dashboard/payments": {
    client: FX.paymentsPage ? ClientPayments : PaymentsPlaceholder,
    freelancer: FX.paymentsPage ? FPayments : null,
  },
  "/dashboard/settings": { client: ClientSettings, freelancer: null },
};

export type DashResolution =
  | { kind: "route" }
  | { kind: "notAvailable"; role: Role }
  | { kind: "notFound" };

export const DASH_PATHS = Object.keys(DASH_ROUTES) as DashPath[];

/* pure resolver, no React: the tests drive this directly */
export function resolveDashArea(role: Role | null, pathname: string): DashResolution {
  const entry = (DASH_PATHS as string[]).includes(pathname) ? DASH_ROUTES[pathname as DashPath] : undefined;
  if (!entry) return { kind: "notFound" };
  const el = role ? entry[role] : null;
  return el ? { kind: "route" } : { kind: "notAvailable", role: role ?? "client" };
}
