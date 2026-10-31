/* Segmented.tsx — a three-way radiogroup, 55px tall, with one brass indicator
   that slides behind the chosen label (0.382s power3.out). Arrow keys move the
   selection and the focus together, the way a radiogroup is expected to behave. */

import { useRef } from "react";
import type { CSSProperties } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (next: T) => void;
  name: string;
}

export function Segmented<T extends string>({ label, value, options, onChange, name }: SegmentedProps<T>) {
  const nodes = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const move = (to: number) => {
    const next = options[(to + options.length) % options.length];
    onChange(next.value);
    nodes.current[(to + options.length) % options.length]?.focus();
  };

  return (
    <div
      className="set-seg"
      role="radiogroup"
      aria-label={label}
      style={{ "--set-seg-count": options.length } as CSSProperties}
    >
      <span
        className="set-seg-glide"
        aria-hidden="true"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(el) => {
            nodes.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          data-checked={option.value === value ? "1" : "0"}
          tabIndex={option.value === value ? 0 : -1}
          className="set-seg-btn"
          name={name}
          onClick={() => onChange(option.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              move(i + 1);
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              move(i - 1);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
