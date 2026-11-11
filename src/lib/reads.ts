/* reads.ts — the dashboard's vault read, behind FX.real.vaultsRead.

   With the flag on, the list comes from GET /api/vaults through the http client
   and is parsed by the adapter: a row that fails validation is dropped rather
   than rendered as a half-vault. With the flag off, the same call returns what
   the app already showed, so nothing changes until the slice is switched on.

   The KPI figures are derived here from the same selectors the Payments page
   reads, so Overview, Earnings and Payments cannot disagree. */

import { listLiveVaults, type Kpis, type Vault } from "./api";
import { request } from "./http";
import { toClientVault } from "./adapters/vaultAdapter";
import { heldTotal } from "./earnings";
import { realOn } from "../config/fx";

/** Every vault the caller may see, in the shape the dashboard draws. */
export async function fetchVaults(): Promise<Vault[]> {
  if (!realOn("vaultsRead")) return listLiveVaults();

  const rows = await request<unknown[]>("/vaults");
  if (!Array.isArray(rows)) throw new Error("The vault service sent an unreadable list.");
  return rows
    .map((row) => toClientVault(row))
    .filter((vault): vault is Vault => vault !== null);
}

/** The three Overview figures. `fundsHeld` is dollars from the cent selector so
    it matches the Payments total; `unlocked` stays a count, as it always was. */
export function kpisOf(vaults: Vault[]): Kpis {
  return {
    fundsHeld: heldTotal(vaults) / 100,
    awaitingReview: vaults.filter((v) => v.status === "audited").length,
    unlocked: vaults.filter((v) => v.status === "unlocked").length,
  };
}

/* ----------------------------------------------------------------- polling ---
   A page refreshes every 5s while it is visible and something is still moving.
   A page with nothing left to move still checks, more slowly: a client can be
   invited to a new vault at any time and must not need a reload to see it.
   Three failures in a row back the moving poll off to 15s so a dead API is not
   hammered. */

export const POLL_MS = 5_000;
export const POLL_IDLE_MS = 15_000;
export const POLL_BACKOFF_MS = 15_000;
export const POLL_BACKOFF_AFTER = 3;

/** How long to wait before the next refresh. `moving` is false when every vault
    on screen is terminal, but membership can still change on the server. */
export function pollDelay(consecutiveErrors: number, moving = true): number {
  if (!moving) return POLL_IDLE_MS;
  return consecutiveErrors >= POLL_BACKOFF_AFTER ? POLL_BACKOFF_MS : POLL_MS;
}

/** A vault that will not change again: nothing left to poll for. */
export const isTerminal = (vault: Vault): boolean =>
  vault.status === "unlocked" || vault.status === "voided";

/** Keep polling while any vault is still moving. */
export const shouldPoll = (vaults: Vault[]): boolean => vaults.some((v) => !isTerminal(v));
