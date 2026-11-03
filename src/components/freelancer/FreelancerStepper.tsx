/* FreelancerStepper.tsx — the five bolts a vault travels: INVITED, FUNDED,
   SUBMITTED, APPROVED, PAID. The node states come from freelancerPhase.ts, so
   what is drawn and what the tests assert are the same values. */

import { Check } from "../dashboard/icons";
import { STEPS, stepperState, type Phase } from "../../lib/freelancerPhase";

export function FreelancerStepper({ phase }: { phase: Phase }) {
  const { nodes, current } = stepperState(phase);

  return (
    <ol className="fd-steps" aria-label={`Progress: ${STEPS[current]?.toLowerCase() ?? phase.replace("_", " ")}`}>
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
              {state === "done" && <Check width="9" height="9" />}
            </span>
            <span className="fd-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
