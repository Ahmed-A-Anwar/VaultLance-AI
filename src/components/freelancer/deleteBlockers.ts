/* deleteBlockers.ts — the freelancer's answer to "can this account go?".

   Pure: vaults in, blockers out. The phase model decides — a funded vault has
   money sitting in escrow, a submitted or in-review one is waiting on a
   verdict, a paid-pending one is one capture away from payout, and a failed
   payout is unresolved until it retries or fails to disappear. Nothing here
   reads the clock or the store. */

import { phaseOf, PHASE_LABEL, type Phase } from "../../lib/freelancerPhase";
import type { FreelancerVault } from "./mockApi";

export interface DeleteBlocker {
  id: string;
  project: string;
  phase: Phase;
  label: string;
  amountCents: number;
  status: string;
}

/* the phases that keep the account alive, verbatim from the spec: funded,
   submitted, in review, paid pending — plus a failed payout left unresolved */
const BLOCKING: ReadonlyArray<Phase> = ["funded", "submitted", "in_review", "paid_pending"];

export function deleteFreelancerBlockers(vaults: FreelancerVault[]): Array<DeleteBlocker> {
  return vaults
    .filter((v) => {
      const phase = phaseOf(v);
      return BLOCKING.includes(phase) || phase === "payout_failed";
    })
    .map((v) => {
      const phase = phaseOf(v);
      return {
        id: v.id,
        project: v.project,
        phase,
        label: PHASE_LABEL[phase],
        amountCents: v.amountCents,
        status: phase === "payout_failed" ? "PAYOUT FAILED" : PHASE_LABEL[phase],
      };
    });
}
