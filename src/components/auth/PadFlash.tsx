/* PadFlash.tsx — the vault's answers to the reset screens: the keypad hotspot
   flashing, and the lit LED when the clip cannot run.

   The keypad's own rect is measured from the live DOM each time, so a flash lands
   on the keypad whatever the viewport is doing, and it is drawn as an overlay
   rather than by touching the vault. Reduced motion gets nothing: every state
   these flashes announce is also written in the strip. */

import { forwardRef, useImperativeHandle, useRef } from "react";
import gsap from "gsap";

export interface PadFlashHandle {
  /* teal twice for a link sent, muted red once for a refusal */
  flash: (kind: "teal" | "red", times?: number) => void;
  /* the code-updated beat without the keypad clip: the LED lights green */
  led: () => void;
}

export interface PadFlashProps {
  reduced: boolean;
}

/* one flash, from nothing, up and back down */
const FLASH = 0.382;

export const PadFlash = forwardRef<PadFlashHandle, PadFlashProps>(function PadFlash({ reduced }, ref) {
  const tealRef = useRef<HTMLDivElement | null>(null);
  const redRef = useRef<HTMLDivElement | null>(null);
  const ledRef = useRef<HTMLDivElement | null>(null);

  const place = (el: HTMLElement | null, target: Element | null) => {
    if (!el || !target) return false;
    const r = target.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    Object.assign(el.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    return true;
  };

  useImperativeHandle(ref, () => ({
    flash(kind, times = 1) {
      if (reduced) return;
      const el = kind === "teal" ? tealRef.current : redRef.current;
      if (!place(el, document.querySelector(".hero-keypad"))) return;
      gsap.killTweensOf(el);
      const tl = gsap.timeline();
      for (let i = 0; i < times; i += 1) {
        tl.fromTo(el, { opacity: 0 }, { opacity: 0.5, duration: FLASH / 2, ease: "power2.out" }).to(
          el,
          { opacity: 0, duration: FLASH / 2, ease: "power2.in" }
        );
      }
    },
    led() {
      if (reduced) return;
      const led = ledRef.current;
      if (!place(led, document.querySelector(".hero-led"))) return;
      gsap.killTweensOf(led);
      gsap.fromTo(
        led,
        { opacity: 0 },
        { opacity: 1, duration: 0.236, ease: "power2.out", overwrite: "auto" }
      );
    },
  }));

  return (
    <div className="auth-pad" aria-hidden="true">
      <div className="auth-pad-teal" ref={tealRef} data-testid="pad-flash-teal" />
      <div className="auth-pad-red" ref={redRef} data-testid="pad-flash-red" />
      <div className="auth-pad-led" ref={ledRef} data-testid="pad-led" />
    </div>
  );
});
