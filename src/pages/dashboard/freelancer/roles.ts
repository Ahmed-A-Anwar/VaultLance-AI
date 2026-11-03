/* roles.ts — the freelancer's column of the shell: which five areas the rail
   lists, what the badge says, and the one brass action in the strip.

   The client shell keeps its own defaults inside Rail and TopStrip and is never
   handed these values, so its DOM and its styles stay exactly as they were. */

import type { ComponentType, SVGProps } from "react";
import { CardIcon, Gear, Grid, Ledger, VaultGlyph } from "../../../components/dashboard/icons";

export interface RailItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  end: boolean;
}

/** Overview, Vaults, Earnings (the ledger route), Payments, Settings. */
export const FREELANCER_NAV: RailItem[] = [
  { to: "/dashboard", label: "Overview", Icon: Grid, end: true },
  { to: "/dashboard/vaults", label: "Vaults", Icon: VaultGlyph, end: false },
  { to: "/dashboard/ledger", label: "Earnings", Icon: Ledger, end: false },
  { to: "/dashboard/payments", label: "Payments", Icon: CardIcon, end: false },
  { to: "/dashboard/settings", label: "Settings", Icon: Gear, end: false },
];

/** The strip's name for each route. Earnings is the ledger route here. */
const TITLES: Array<[string, string]> = [
  ["/dashboard/vaults", "Vaults"],
  ["/dashboard/ledger", "Earnings"],
  ["/dashboard/payments", "Payments"],
  ["/dashboard/settings", "Settings"],
  ["/dashboard", "Overview"],
];

export function freelancerTitleFor(pathname: string): string {
  const hit = TITLES.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  return hit?.[1] ?? "Overview";
}

export const FREELANCER_BADGE = "FREELANCER";

/** The strip's brass action dispatches this; the surface listens and opens the drawer. */
export const NEW_VAULT_EVENT = "fd:new-vault";
