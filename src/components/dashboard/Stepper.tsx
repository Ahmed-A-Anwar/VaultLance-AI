/* Stepper.tsx — the five bolts a vault travels through: uploaded, authorized,
   audited, captured, unlocked. Done nodes carry a check, the current one is the
   brass node with a soft glow, and the rest wait empty. A voided hold shows no
   current node at all. */

import { Check } from "./icons";
import type { VaultStatus } from "../../lib/api";

const STEPS = ["Uploaded", "Authorized", "Audited", "Captured", "Unlocked"] as const;

/* the node the vault is standing on: the next step it has to take */
const CURRENT: Record<VaultStatus, number> = {
  awaiting_payment: 1,
  held: 2,
  audited: 3,
  unlocked: STEPS.length,
  voided: -1,
};

export function Stepper({ status }: { status: VaultStatus }) {
  const current = CURRENT[status];
  return (
    <ol className="dash-stepper" aria-label={`Progress: ${status.replace("_", " ")}`}>
      {STEPS.map((label, i) => {
        const state = current < 0 ? "void" : i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} className="dash-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="dash-step-node" aria-hidden="true">
              {state === "done" && <Check width="11" height="11" />}
            </span>
            <span className="dash-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
