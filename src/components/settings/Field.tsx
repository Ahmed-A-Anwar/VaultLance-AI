/* Field.tsx — label, 55px input, inline error. The settings cards all ask for
   the same block: a visible label above the field, the input itself, an optional
   lock (the address) and an optional trailing control (the show/hide toggle).

   Errors are linked with aria-describedby and only a submit failure gets
   role="alert"; a blur message is read when the field is reached again. */

import { forwardRef } from "react";
import type { ReactNode } from "react";
import { Padlock } from "../dashboard/icons";

export interface FieldProps {
  id: string;
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
  /* the submit failure, the only one a screen reader interrupts for */
  alert?: boolean;
  hint?: string;
  autoComplete?: string;
  inputMode?: "email" | "text";
  readOnly?: boolean;
  locked?: boolean;
  trailing?: ReactNode;
  testId?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  {
    id,
    label,
    type = "text",
    value,
    onChange,
    onBlur,
    error,
    alert = false,
    hint,
    autoComplete,
    inputMode,
    readOnly = false,
    locked = false,
    trailing,
    testId,
  },
  ref
) {
  const errorId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="set-field">
      <label className="set-label" htmlFor={id}>
        {label}
      </label>
      <div className={`set-input-wrap${locked ? " is-locked" : ""}${trailing ? " has-trail" : ""}`}>
        {locked && <Padlock className="set-input-lock" width="16" height="16" />}
        <input
          ref={ref}
          id={id}
          className="set-input"
          type={type}
          name={id}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          onBlur={onBlur}
          autoComplete={autoComplete}
          inputMode={inputMode}
          readOnly={readOnly}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          data-testid={testId}
        />
        {trailing}
      </div>
      {hint && !error && (
        <p className="set-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="set-err" id={errorId} role={alert ? "alert" : undefined} data-testid={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
});
