/* TwoStepButton.tsx — a destructive action that costs two clicks. The first arms
   it for three seconds and the label itself says so ("Confirm revoke"), with a
   2px line draining under the button. A second click inside the window fires;
   after it, or on blur, the button goes back to its written warning.

   The state lives in the label, not in the colour: a colour alone would ask a
   colour-blind or screen-reader visitor to guess. */

import { useCallback, useEffect, useRef, useState } from "react";

const WINDOW_MS = 3000;

export interface TwoStepButtonProps {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

export function TwoStepButton({
  label,
  confirmLabel,
  onConfirm,
  disabled = false,
  className,
  testId,
}: TwoStepButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(0);

  const disarm = useCallback(() => {
    window.clearTimeout(timer.current);
    setArmed(false);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={`dash-btn ${className ?? "dash-btn-ghost"} set-two${armed ? " is-armed" : ""}`}
      data-testid={testId}
      aria-live="polite"
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), WINDOW_MS);
          return;
        }
        disarm();
        onConfirm();
      }}
      onBlur={disarm}
    >
      <span className="dash-btn-label">{armed ? confirmLabel : label}</span>
      {armed && <span className="set-two-line" aria-hidden="true" />}
    </button>
  );
}
