/* SignupStepper.tsx — the role's path, drawn as four nodes on a hairline.

   Desktop: a vertical rail in the left strip that stays faint and empty until a
   role is chosen (or hovered/focused). Compact: a numbered row inside the card
   under the heading, one caption at a time.

   Motion: the line draws top to bottom once (1s), labels and captions fade in
   with a 0.1s stagger, a role switch fades the copy through over 0.382s, and a
   successful submit lights the nodes in sequence (0.236s apart) before the
   success state. Reduced motion shows every final state at once. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { STEPPERS, type Role } from "./stepper-content";
import "./stepper.css";

export type Phase = "idle" | "done";

export interface SignupStepperProps {
  variant: "vertical" | "compact";
  /* locked role, set by choosing one */
  role: Role | null;
  /* hover or keyboard focus on a role card, before it is locked */
  preview: Role | null;
  phase: Phase;
  /* every node has lit */
  onDone?: () => void;
  reduced: boolean;
}

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export function SignupStepper({ variant, role, preview, phase, onDone, reduced }: SignupStepperProps) {
  const shown = role ?? preview;
  const steps = shown ? STEPPERS[shown] : null;
  const previewing = !role && !!preview;

  const blockRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const baseRef = useRef<SVGPathElement | null>(null);
  const drawRef = useRef<SVGPathElement | null>(null);
  const nodeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const drawn = useRef(false);
  const priorRole = useRef<Role | null>(null);
  const [lit, setLit] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  /* ---- the rail: one path from the first node's centre to the last ---- */
  useLayoutEffect(() => {
    if (variant !== "vertical") return;
    const measure = () => {
      const list = listRef.current;
      const svg = svgRef.current;
      const base = baseRef.current;
      const draw = drawRef.current;
      if (!list || !svg || !base || !draw) return;
      const nodes = nodeRefs.current.filter(Boolean) as HTMLSpanElement[];
      if (!nodes.length) return;
      const box = list.getBoundingClientRect();
      const mid = (el: HTMLSpanElement) =>
        el.getBoundingClientRect().top + el.offsetHeight / 2 - box.top;
      const top = mid(nodes[0]);
      const bottom = Math.max(top + 1, mid(nodes[nodes.length - 1]));
      const d = `M 6.5 ${top.toFixed(1)} V ${bottom.toFixed(1)}`;
      svg.setAttribute("viewBox", `0 0 13 ${Math.max(1, Math.round(box.height))}`);
      svg.setAttribute("height", `${Math.round(box.height)}`);
      base.setAttribute("d", d);
      draw.setAttribute("d", d);
      /* the draw is a dash of exactly the path's length: offset 1 = hidden */
      const len = draw.getTotalLength();
      draw.setAttribute("stroke-dasharray", String(len));
      if (!drawn.current) draw.setAttribute("stroke-dashoffset", String(len));
    };
    measure();
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(list);
    return () => ro.disconnect();
  }, [variant, shown, phase]);

  /* ---- lock: draw the rail once, then fade the copy in ---- */
  useEffect(() => {
    if (!role) return;
    const draw = drawRef.current;
    const copies = listRef.current
      ? Array.from(listRef.current.querySelectorAll<HTMLElement>(".stepper-copy"))
      : [];
    if (reduced) {
      if (draw) gsap.set(draw, { opacity: 1, strokeDashoffset: 0 });
      gsap.set(copies, { opacity: 1, y: 0, clearProps: "transform" });
      drawn.current = true;
      return;
    }
    if (draw && !drawn.current) {
      drawn.current = true;
      const len = draw.getTotalLength();
      gsap.set(draw, { opacity: 1, strokeDasharray: len, strokeDashoffset: len });
      gsap.to(draw, { strokeDashoffset: 0, duration: 1, ease: "power3.inOut" });
      if (copies.length) {
        gsap.fromTo(
          copies,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.618, stagger: 0.1, delay: 0.382, ease: "power2.out" }
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, reduced]);

  /* ---- switching role: fade the copy through, keep the rail drawn ---- */
  useEffect(() => {
    if (!role) {
      priorRole.current = role;
      return;
    }
    const changed = priorRole.current !== null && priorRole.current !== role;
    priorRole.current = role;
    const copies = listRef.current
      ? Array.from(listRef.current.querySelectorAll<HTMLElement>(".stepper-copy"))
      : [];
    if (!copies.length || !changed || reduced) return;
    const tl = gsap.timeline();
    tl.to(copies, { opacity: 0, duration: 0.191, ease: "power2.in" }).to(copies, {
      opacity: 1,
      duration: 0.191,
      ease: "power2.out",
    });
    return () => {
      tl.kill();
      gsap.set(copies, { opacity: 1 });
    };
  }, [role, reduced]);

  /* ---- preview dims the block while it is only a preview ---- */
  useEffect(() => {
    const el = blockRef.current;
    if (!el) return;
    gsap.to(el, { opacity: previewing ? 0.6 : 1, duration: reduced ? 0 : 0.236, overwrite: "auto" });
  }, [previewing, reduced]);

  /* ---- submit: light the nodes in sequence, then hand back ---- */
  useEffect(() => {
    if (phase !== "done") {
      setLit(0);
      return;
    }
    const nodes = nodeRefs.current.filter(Boolean) as HTMLSpanElement[];
    if (reduced) {
      setLit(nodes.length);
      onDone?.();
      return;
    }
    const calls: gsap.core.Tween[] = [];
    nodes.forEach((node, i) => {
      calls.push(
        gsap.delayedCall(0.236 * i, () => {
          setLit(i + 1);
          gsap.fromTo(node, { scale: 0.6 }, { scale: 1, duration: 0.236, ease: "back.out(2.2)" });
        })
      );
    });
    const end = gsap.delayedCall(0.236 * nodes.length + 0.382, () => onDone?.());
    return () => {
      calls.forEach((c) => c.kill());
      end.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reduced]);

  if (variant === "compact") {
    return (
      <div className="stepper-compact">
        <div className="stepper-compact-row" role="group" aria-label="Your path">
          {Array.from({ length: 4 }).map((_, i) => {
            const step = steps?.[i];
            const done = lit > i;
            const active = !!role && i === 0 && phase === "idle";
            return (
              <button
                key={i}
                type="button"
                className="stepper-chip"
                data-state={done ? "done" : active ? "active" : step ? "next" : "empty"}
                disabled={!step}
                aria-expanded={step ? open === i : undefined}
                aria-label={step ? `Step ${i + 1}: ${step.label}` : `Step ${i + 1}`}
                onClick={() => setOpen((v) => (v === i ? null : i))}
              >
                <span className="stepper-chip-dot" aria-hidden="true">
                  {done ? CHECK : i + 1}
                </span>
                {step && <span className="stepper-chip-label">{step.label}</span>}
              </button>
            );
          })}
        </div>
        <p className="stepper-compact-caption" aria-live="polite">
          {open !== null && steps ? steps[open].caption : ""}
        </p>
        {!shown && <span className="stepper-note">PICK A ROLE TO SEE YOUR PATH.</span>}
      </div>
    );
  }

  return (
    <div className="stepper" ref={blockRef}>
      <svg className="stepper-rail" ref={svgRef} width="13" preserveAspectRatio="none" aria-hidden="true">
        <path className="stepper-rail-base" ref={baseRef} />
        <path className="stepper-rail-draw" ref={drawRef} />
      </svg>

      {role && phase === "idle" && (
        <span className="stepper-here" aria-hidden="true">
          <span className="stepper-here-dot" />
          YOU ARE HERE
        </span>
      )}

      <ol className="stepper-list" aria-label="Your path" ref={listRef}>
        {Array.from({ length: 4 }).map((_, i) => {
          const step = steps?.[i];
          const done = lit > i;
          const active = !!role && i === 0 && phase === "idle";
          return (
            <li
              className="stepper-step"
              key={i}
              data-state={done ? "done" : active ? "active" : step ? "next" : "empty"}
            >
              <span
                className="stepper-node"
                aria-hidden="true"
                ref={(el) => {
                  nodeRefs.current[i] = el;
                }}
              >
                {done && CHECK}
              </span>
              {step && (
                <div className="stepper-copy">
                  <span className="stepper-label">{step.label}</span>
                  <p className="stepper-caption">{step.caption}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!shown && <p className="stepper-note">PICK A ROLE TO SEE YOUR PATH.</p>}
    </div>
  );
}

export default SignupStepper;
