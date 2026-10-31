/* AuthField.tsx — label, input, error. The reset screens repeat this small block
   rather than sharing /signin's inline one (see the scope note); the classes are
   the same, so the two read as one card. A field with a trailing control (the
   show/hide toggle) gets the wrapper that reserves room for it. */

import { forwardRef } from "react";
import type { FocusEvent, ReactNode } from "react";

export interface AuthFieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  /* the message under the field, already worded */
  error?: string | null;
  /* a submit failure is the only error a screen reader interrupts for */
  alert?: boolean;
  hint?: string;
  autoComplete?: string;
  inputMode?: "email" | "text";
  trailing?: ReactNode;
}

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  {
    id,
    label,
    type,
    value,
    onChange,
    onBlur,
    onFocus,
    error,
    alert = false,
    hint,
    autoComplete,
    inputMode,
    trailing,
  },
  ref
) {
  const errorId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="signin-field">
      <label className="signin-label" htmlFor={id}>
        {label}
      </label>
      <div className={trailing ? "signin-pw" : undefined}>
        <input
          ref={ref}
          id={id}
          className="signin-input"
          type={type}
          name={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={onFocus}
          autoComplete={autoComplete}
          inputMode={inputMode}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {trailing}
      </div>
      {hint && !error && (
        <p className="auth-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="signin-err" id={errorId} role={alert ? "alert" : undefined} data-testid={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
});
