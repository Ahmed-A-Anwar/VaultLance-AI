/* PhaseChip.tsx — the nine-phase chip. Accents live on the border and the dot;
   the text uses the darkened text tokens from freelancer.css so 12px mono stays
   above 4.5:1 on its own 12% fill. Every chip carries a word: colour never
   carries the state alone. */

import { PHASE_LABEL, type Phase } from "../../lib/freelancerPhase";

const TONE: Record<Phase, string> = {
  draft: "steel-dashed",
  invited: "steel",
  funded: "brass",
  submitted: "teal-outline",
  in_review: "teal",
  paid_pending: "brass",
  paid: "success",
  payout_failed: "danger",
  voided: "danger",
};

export function PhaseChip({ phase }: { phase: Phase }) {
  return (
    <span className="fd-chip" data-tone={TONE[phase]} data-phase={phase}>
      {phase === "paid_pending" && <span className="fd-chip-spin" aria-hidden="true" />}
      {PHASE_LABEL[phase]}
    </span>
  );
}
