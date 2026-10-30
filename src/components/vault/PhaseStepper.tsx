/* PhaseStepper.tsx — the five phases a vault travels through, 89px of glass
   under the top bar. The line fills with brass as far as the vault has got, the
   node it stands on is the brass one, and a node that just became done pulses
   once. A voided hold keeps the ground it reached and lights nothing further. */

import { useEffect, useRef, useState } from "react";
import type { VaultStatus } from "../../lib/api";
import { Check } from "./icons";

const STEPS = [
  { label: "Uploaded", caption: "Files locked in storage." },
  { label: "Authorized", caption: "Funds held on PayPal." },
  { label: "Audited", caption: "Real checks complete." },
  { label: "Captured", caption: "Payment received." },
  { label: "Unlocked", caption: "Files released." },
] as const;

/* the step the vault stands on: the last one it finished. unlocked is past
   the last node, so every node reads as done. */
const CURRENT: Record<VaultStatus, number> = {
  awaiting_payment: 0,
  held: 1,
  audited: 2,
  unlocked: STEPS.length,
  voided: -1,
};

export function PhaseStepper({ status }: { status: VaultStatus }) {
  const current = CURRENT[status];
  /* a voided hold keeps whatever ground it had */
  const stopped = useRef(Math.max(0, current));
  if (current >= 0) stopped.current = current;
  const at = current < 0 ? stopped.current : current;
  const done = Math.min(at, STEPS.length);

  const previousDone = useRef(done);
  const [pulseAt, setPulseAt] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    const timer = window.setTimeout(() => setSettled(true), 1050);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (done > previousDone.current) {
      setPulseAt(done - 1);
      const timer = window.setTimeout(() => setPulseAt(-1), 618);
      previousDone.current = done;
      return () => window.clearTimeout(timer);
    }
    previousDone.current = done;
  }, [done]);

  const fill = Math.min(done, 4) / 4;

  return (
    <div className="room-phase" data-enter="phase" aria-label="Audit phase">
      <ol className="room-steps">
        <span className="room-steps-line" aria-hidden="true" />
        <span
          className="room-steps-fill"
          aria-hidden="true"
          style={{ "--at": mounted ? fill : 0, "--dur": settled ? "618ms" : "1000ms" } as React.CSSProperties}
        />
        {STEPS.map((step, i) => {
          const state = current < 0 ? (i < done ? "done" : "todo") : i < at ? "done" : i === at ? "current" : "todo";
          return (
            <li
              key={step.label}
              className="room-step"
              data-state={state}
              data-pulse={pulseAt === i ? "true" : undefined}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="room-step-node" aria-hidden="true">
                {state === "done" && <Check width="11" height="11" />}
              </span>
              <span className="room-step-label">{step.label}</span>
              <span className="room-step-caption">{step.caption}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
