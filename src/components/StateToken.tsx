import type { ReactElement } from "react";
import { Lock, Scan, Cross, Check, Clock, Seal } from "./icons";
import type { MoneyState } from "../lib/store";

const MARKS: Record<MoneyState, (p: { className?: string }) => ReactElement> = {
  SEALED: Lock, AUDITING: Scan, HELD: Clock,
  CAPTURED: Check, VOIDED: Cross, RELEASED: Lock,
  PAID: Seal,
};

/* Token: colour + mark + word — never colour alone (RESEARCH.md, Prismr's rule). */
export function StateToken({ state, loud, showWord = true }: { state: MoneyState; loud?: boolean; showWord?: boolean }) {
  const Mark = MARKS[state];
  return (
    <span className={`tok${loud ? " tok-hero" : ""}`} data-state={state} data-loud={loud ? "true" : undefined}>
      <span className="tok-dot" aria-hidden="true" />
      <Mark className="tok-ico" />
      {showWord && <span>{state}</span>}
    </span>
  );
}
