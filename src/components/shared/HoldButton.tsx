/* HoldButton.tsx — approving money should cost a deliberate second. Hold the
   pointer (or Space / Enter) for 1.618s and the ring closes; let go early and it
   drains in 0.382s without doing anything. Touch, mouse and keyboard all drive
   the same clock, and the ring is written straight to the DOM so a held button
   does not re-render sixty times a second.

   Screen readers get the same power without a hold: a "Confirm approval" button
   that is hidden until it takes focus.

   Shared by the client dashboard's vault cards and the audit room's decision
   panel. The host supplies its own visual class; the ring, the clock and the
   aria contract live here, once. */

import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_MS = 1618;
const DRAIN_MS = 382;
const STAGES = [0, 0.25, 0.5, 0.75];

export function HoldButton({
  onConfirm,
  disabled,
  pending,
  done,
  className,
  label = "Hold to approve & pay",
  pendingLabel = "Approving…",
}: {
  onConfirm: () => void;
  disabled?: boolean;
  pending?: boolean;
  done?: boolean;
  /* the host's own class, appended to the button */
  className?: string;
  label?: string;
  pendingLabel?: string;
}) {
  const ring = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const startedAt = useRef(0);
  const value = useRef(0);
  const fired = useRef(false);
  const [holding, setHolding] = useState(false);
  const [stage, setStage] = useState(0);
  const [pulse, setPulse] = useState(false);

  const paint = useCallback((p: number) => {
    value.current = p;
    ring.current?.style.setProperty("--hold", String(p));
    const at = STAGES.filter((s) => p >= s).length - 1;
    setStage((prev) => (at > prev ? at : prev));
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
  }, []);

  /* release: drain whatever is there, never fire */
  const cancel = useCallback(() => {
    stop();
    setHolding(false);
    const from = value.current;
    if (from <= 0) return;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / DRAIN_MS);
      paint(from * (1 - p));
      if (p < 1) raf.current = requestAnimationFrame(step);
      else setStage(0);
    };
    raf.current = requestAnimationFrame(step);
  }, [paint, stop]);

  const begin = useCallback(() => {
    if (disabled || pending || done || fired.current) return;
    stop();
    setHolding(true);
    startedAt.current = performance.now() - value.current * HOLD_MS;
    const step = (t: number) => {
      const p = Math.min(1, (t - startedAt.current) / HOLD_MS);
      paint(p);
      if (p < 1) {
        raf.current = requestAnimationFrame(step);
        return;
      }
      fired.current = true;
      setHolding(false);
      setPulse(true);
      window.setTimeout(() => setPulse(false), 382);
      onConfirm();
    };
    raf.current = requestAnimationFrame(step);
  }, [disabled, done, onConfirm, paint, pending, stop]);

  useEffect(() => stop, [stop]);

  const text = done ? "Approved" : holding ? "Keep holding…" : label;

  return (
    <div className="dash-hold-wrap">
      <button
        type="button"
        className={`dash-btn dash-btn-primary dash-hold${className ? ` ${className}` : ""}`}
        data-pulse={pulse ? "true" : undefined}
        disabled={disabled || pending || done}
        aria-describedby="dash-hold-help"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          begin();
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={(e) => {
          if (e.key !== " " && e.key !== "Enter") return;
          if (e.repeat) return;
          e.preventDefault();
          begin();
        }}
        onKeyUp={(e) => {
          if (e.key !== " " && e.key !== "Enter") return;
          e.preventDefault();
          cancel();
        }}
        onBlur={cancel}
      >
        <span ref={ring} className="dash-hold-ring" aria-hidden="true" />
        <span className="dash-btn-label">{pending ? pendingLabel : text}</span>
        {pending && <span className="dash-spin" aria-hidden="true" />}
      </button>

      {/* the screen-reader route: same action, no hold */}
      <button
        type="button"
        className="dash-sr dash-hold-alt"
        disabled={disabled || pending || done}
        onClick={onConfirm}
      >
        Confirm approval
      </button>

      <p id="dash-hold-help" className="dash-sr">
        Press and hold for one and a half seconds to approve and pay.
      </p>
      <p className="dash-sr" aria-live="polite">
        {holding && stage > 0 ? `Approval ${stage * 25} percent` : done ? "Approved" : ""}
      </p>
    </div>
  );
}
