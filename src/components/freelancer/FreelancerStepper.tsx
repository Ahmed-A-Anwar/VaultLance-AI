/* FreelancerStepper.tsx — the five bolts a vault travels: INVITED, FUNDED,
   SUBMITTED, APPROVED, PAID. One 21px row that never wraps: five 13px nodes
   joined by a 1px line, and only the node the vault stands on shows its label.
   Every other node carries the step name as an aria-label and a tooltip, so
   nothing is lost by hiding the words. Done nodes are success green with a
   check, like the client dashboard; the current node is brass with a glow. */

import { Check } from "../dashboard/icons";
import { STEPS, stepperState, type Phase } from "../../lib/freelancerPhase";

export function FreelancerStepper({ phase }: { phase: Phase }) {
  const { nodes, current } = stepperState(phase);

  return (
    <ol className="fd-steps" aria-label={`Progress: ${STEPS[current]?.toLowerCase() ?? phase.replace("_", " ")}`}>
      {STEPS.map((label, i) => {
        const state = nodes[i];
        const isCurrent = i === current;
        return (
          <li
            key={label}
            className="fd-step"
            data-state={state}
            aria-label={label}
            title={isCurrent ? undefined : label}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className="fd-step-node" aria-hidden="true">
              {state === "done" && <Check width="9" height="9" />}
            </span>
            {isCurrent && <span className="fd-step-label">{label}</span>}
          </li>
        );
      })}
    </ol>
  );
}
