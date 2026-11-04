/* freelancerSettingsApi.ts — the danger zone, for the freelancer role.

   Everything here stays mock and delayed like the client's same calls in
   lib/api; the difference is the data: the freelancer's vaults, events and
   payouts come from the freelancer store, and the delete decision uses the
   phase model (components/freelancer/deleteBlockers.ts) instead of the
   client's held/audited statuses. Each function names the endpoint it
   becomes once this is not a sandbox. */

import { FX } from "../../../config/fx";
import {
  listFreelancerEvents,
  listFreelancerVaults,
  resetFreelancerData,
  type FreelancerVault,
} from "../../../components/freelancer/mockApi";
import {
  deleteFreelancerBlockers,
  type DeleteBlocker,
} from "../../../components/freelancer/deleteBlockers";
import { payoutsFrom } from "../../../components/payments/paymentsModel";
import { MOCK_ERROR_RATE } from "../../../components/freelancer/mockConfig";
import { readSession } from "../../../lib/mockAuth";

const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms));

const latency = () => 300 + Math.round(Math.random() * 318);

const maybeFail = () => {
  if (FX.mockErrors && Math.random() < MOCK_ERROR_RATE) {
    throw new Error("The request did not reach the server.");
  }
};

/* PUT /v1/me/export — the freelancer's vaults, events and payouts as one JSON
   file; the payouts are built by the same selectors the Payments page reads. */
export async function exportFreelancerData(): Promise<Blob> {
  await wait(latency());
  maybeFail();
  const [vaults, events] = await Promise.all([listFreelancerVaults(), listFreelancerEvents()]);
  const payload = {
    exportedAt: new Date().toISOString(),
    sandbox: true,
    role: "freelancer" as const,
    vaults,
    events,
    payouts: payoutsFrom(vaults, events),
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

/* GET /v1/me/delete-blockers — the vaults whose phase keeps money in motion. */
export async function listFreelancerDeleteBlockers(): Promise<DeleteBlocker[]> {
  await wait(latency());
  maybeFail();
  const vaults: FreelancerVault[] = await listFreelancerVaults();
  return deleteFreelancerBlockers(vaults);
}

/* DELETE /v1/me — refused by the guard upstream while anything above is in
   motion; here the typed email must match and the store is wiped. */
export async function deleteFreelancerAccount(emailConfirm: string): Promise<void> {
  await wait(latency());
  maybeFail();
  const session = readSession();
  const expected = (session?.email ?? "").toLowerCase();
  if (emailConfirm.trim().toLowerCase() !== expected) {
    throw new Error("That email doesn't match this account.");
  }
  /* clearing the store is the account deletion: every draft and every payout
     history row in this sandbox is gone with it */
  resetFreelancerData();
}
