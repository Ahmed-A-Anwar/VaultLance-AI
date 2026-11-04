/* useTween.ts — the fee calculator's 0.382s count. The dashboard's CountUp is
   fixed at one second and lives in a file this page may not edit, so the
   calculator carries its own short version of the same idea: same ease-out,
   same straight swap when motion is reduced. */

import { useEffect, useRef, useState } from "react";

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useTween(value: number, ms = 382): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduceMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (b - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return shown;
}
