/* FreelancerStepper.tsx — the five bolts the freelancer's money travels
   through: INVITED, FUNDED, SUBMITTED, APPROVED, PAID. The node states come from
   the pure phase model, so the drawing cannot drift from the tests.

   A node's state is never carried by colour alone: done nodes carry a check and
   a struck label, the current node is named in the accessible label, and the
   danger node keeps its "PAID" word beside the mark. */

import { Check } from "../dashboard/icons";
import { STEPS, stepperState, type Phase } from "../../lib/freelancerPhase";

export function FreelancerStepper({ phase }: { phase: Phase }) {
  const { nodes, current } = stepperState(phase);
  const label =
    phase === "voided"
      ? "Progress: frozen, the hold was voided"
      : phase === "paid"
        ? "Progress: all five steps complete"
        : `Progress: step ${current + 1} of ${STEPS.length}`;

  return (
    <ol className="fd-steps" aria-label={label}>
      {STEPS.map((label, i) => {
        const state = nodes[i];
        return (
          <li
            key={label}
            className="fd-step"
            data-state={state}
            aria-current={i === current ? "step" : undefined}
          >
            <span className="fd-step-node" aria-hidden="true">
              {state === "done" && <Check width="11" height="11" />}
            </span>
            <span className="fd-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
