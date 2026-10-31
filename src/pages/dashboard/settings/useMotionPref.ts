/* useMotionPref.ts — the effective motion answer for this page, and the one place
   that writes data-motion on <html>.

   Three values, one meaning: "system" follows the operating system, "reduce"
   turns motion off whatever the system says, "full" allows it whatever the system
   says. settings.css keys the global transition/annotation kill switch off
   data-motion="reduce"; the page uses the returned boolean for its own GSAP
   work, so no timeline in another page has to know this preference exists. */

import { useEffect, useState } from "react";
import type { MotionPref } from "../../../lib/api";

const QUERY = "(prefers-reduced-motion: reduce)";

const systemReduced = () =>
  typeof window !== "undefined" && window.matchMedia(QUERY).matches;

export function useMotionPref(pref: MotionPref): boolean {
  const [system, setSystem] = useState(systemReduced);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setSystem(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (pref === "reduce") root.dataset.motion = "reduce";
    else if (pref === "full") root.dataset.motion = "full";
    else delete root.dataset.motion;
  }, [pref]);

  if (pref === "reduce") return true;
  if (pref === "full") return false;
  return system;
}
