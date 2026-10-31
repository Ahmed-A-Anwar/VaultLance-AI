/* Switch.tsx — the settings switch: 55 x 34 track, a 26px white thumb, teal when
   on. A real role="switch" button with aria-checked, and the visible label is the
   column header beside it (the caller passes the same words as aria-label, so a
   screen reader hears "Payment authorized, email, switch, on").

   `delay` is the mute-all domino: each row's transition is pushed 0.0618s further
   down the list without adding any JavaScript timing. */

import type { CSSProperties } from "react";

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  delay = 0,
  testId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /* the row + channel, e.g. "Payment authorized, email" */
  label: string;
  disabled?: boolean;
  delay?: number;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="set-switch"
      data-on={checked ? "1" : "0"}
      data-testid={testId}
      disabled={disabled}
      style={delay ? ({ "--set-delay": `${delay}s` } as CSSProperties) : undefined}
      onClick={() => onChange(!checked)}
    >
      <span className="set-switch-thumb" aria-hidden="true" />
    </button>
  );
}
