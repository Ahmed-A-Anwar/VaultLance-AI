import { createContext, useContext, useState, type ReactNode } from "react";

/*
  PLAN M3 — shared-element continuity. Clicking the landing CTA records the
  button's viewport rect and label, then client-side-navigates (no reload) to
  the target route, whose hero re-enters from that captured rect instead of
  popping in.
*/
interface Morph { rect: { top: number; left: number; width: number; height: number }; label: string }
const MorphCtx = createContext<{
  origin: Morph | null;
  startMorph: (el: Element, label: string) => void;
}>({ origin: null, startMorph: () => {} });

export function MorphProvider({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<Morph | null>(null);
  const startMorph = (el: Element, label: string) => {
    const r = el.getBoundingClientRect();
    setOrigin({ rect: { top: r.top, left: r.left, width: r.width, height: r.height }, label });
  };
  return <MorphCtx.Provider value={{ origin, startMorph }}>{children}</MorphCtx.Provider>;
}

export const useMorph = () => useContext(MorphCtx);
