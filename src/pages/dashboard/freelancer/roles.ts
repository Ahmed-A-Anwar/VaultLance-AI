/* roles.ts — what the shell shows for each role. The CLIENT column is what the
   dashboard already had, restated here only as documentation: the client
   components keep their own defaults and are never passed these values, so the
   client's DOM and styles stay byte-identical.

   Freelancer rail: Overview, Vaults, Earnings (the ledger route), Payments
   (placeholder), Settings. The badge and the one brass action differ too. */

import type { ComponentType, SVGProps } from "react";
import { CardIcon, Gear, Grid, Ledger, VaultGlyph } from "../../../components/dashboard/icons";

export interface RailItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  end: boolean;
}

/** The five areas a freelancer sees. Labels are the spec's, not the client's. */
export const FREELANCER_NAV: RailItem[] = [
  { to: "/dashboard", label: "Overview", Icon: Grid, end: true },
  { to: "/dashboard/vaults", label: "Vaults", Icon: VaultGlyph, end: false },
  { to: "/dashboard/ledger", label: "Earnings", Icon: Ledger, end: false },
  { to: "/dashboard/payments", label: "Payments", Icon: CardIcon, end: false },
  { to: "/dashboard/settings", label: "Settings", Icon: Gear, end: false },
];

/** The strip's title per route. "/dashboard/ledger" is "Earnings" here. */
const FREELANCER_TITLES: Array<[string, string]> = [
  ["/dashboard/vaults", "Vaults"],
  ["/dashboard/ledger", "Earnings"],
  ["/dashboard/payments", "Payments"],
  ["/dashboard/settings", "Settings"],
  ["/dashboard", "Overview"],
];

export function freelancerTitleFor(pathname: string): string {
  const hit = FREELANCER_TITLES.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  return hit?.[1] ?? "Overview";
}

export const FREELANCER_BADGE = "FREELANCER";

/** The one brass action in the strip. The drawer listens for this in slice 5. */
export const NEW_VAULT_EVENT = "fd:new-vault";
