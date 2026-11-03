/* PhaseChip.tsx — the one line that says where a vault stands. Text first:
   the colour is a second signal, never the only one, and the payout-pending
   chip carries a spinner because "on its way" is a state in motion. */

import { PHASE_LABEL, type Phase } from "../../lib/freelancerPhase";

export function PhaseChip({ phase }: { phase: Phase }) {
  return (
    <span className="fd-chip" data-phase={phase}>
      {phase === "paid_pending" && <span className="fd-chip-spin" aria-hidden="true" />}
      <span className="fd-chip-text">{PHASE_LABEL[phase]}</span>
    </span>
  );
}
