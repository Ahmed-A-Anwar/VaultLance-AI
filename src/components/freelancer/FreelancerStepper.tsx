/* FreelancerStepper.tsx — the client dashboard's stepper, with the freelancer's
   five steps: INVITED, FUNDED, SUBMITTED, APPROVED, PAID. Five equal columns
   joined by a hairline, the label under every node like the client card, done
   nodes in success green with a check, the current node brass with a glow, and
   a failed PAID node in danger. */

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
