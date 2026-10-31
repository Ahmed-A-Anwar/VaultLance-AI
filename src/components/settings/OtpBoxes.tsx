/* OtpBoxes.tsx — six single-digit boxes for the 2FA code. Each box is 55 x 55
   (44 x 55 on a phone), typing advances, backspace goes back, and a paste of the
   whole code fills every box at once. The value is one string so the caller never
   has to join an array to check it. */

import { useEffect, useRef } from "react";

const LENGTH = 6;

export interface OtpBoxesProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: boolean;
  success?: boolean;
}

export function OtpBoxes({ value, onChange, disabled = false, error = false, success = false }: OtpBoxesProps) {
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  /* a fast typist can land the next keystroke before React re-renders, so the
     running code is mirrored here and every edit reads the mirror, not the prop */
  const current = useRef(value);
  useEffect(() => {
    current.current = value;
  }, [value]);
  const digits = value.padEnd(LENGTH, " ").slice(0, LENGTH).split("");

  const write = (next: string) => {
    const joined = next.replace(/\s+$/, "");
    current.current = joined;
    onChange(joined);
  };

  const put = (code: string, at: number) => {
    const clean = code.replace(/\D/g, "");
    if (!clean) return;
    const next = current.current.padEnd(LENGTH, " ").split("");
    for (let i = 0; i < clean.length && at + i < LENGTH; i += 1) next[at + i] = clean[i];
    write(next.join(""));
    const focusAt = Math.min(at + clean.length, LENGTH - 1);
    boxes.current[focusAt]?.focus();
  };

  return (
    <div className="set-otp" data-error={error ? "1" : "0"} data-success={success ? "1" : "0"}>
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          className="set-otp-box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digits[i]?.trim() ?? ""}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={error || undefined}
          onChange={(e) => put(e.target.value, i)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            /* a box that already holds a digit would swallow the next keystroke
               (maxLength is 1), so digits are written straight into the code */
            if (/^[0-9]$/.test(e.key)) {
              e.preventDefault();
              put(e.key, i);
              return;
            }
            if (e.key === "Backspace") {
              if (digits[i]?.trim()) {
                const next = current.current.padEnd(LENGTH, " ").split("");
                next[i] = " ";
                write(next.join(""));
                return;
              }
              e.preventDefault();
              const prev = Math.max(0, i - 1);
              const next = current.current.padEnd(LENGTH, " ").split("");
              next[prev] = " ";
              write(next.join(""));
              boxes.current[prev]?.focus();
            }
            if (e.key === "ArrowLeft" && i > 0) {
              e.preventDefault();
              boxes.current[i - 1]?.focus();
            }
            if (e.key === "ArrowRight" && i < LENGTH - 1) {
              e.preventDefault();
              boxes.current[i + 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            put(e.clipboardData.getData("text"), i);
          }}
        />
      ))}
    </div>
  );
}
