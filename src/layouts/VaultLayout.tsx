/* VaultLayout.tsx — the vault is mounted once, here, and every route renders
   inside it. "/" puts the hero copy beside it; "/signup" puts the form card in
   the left column and slides the vault to its signup anchor. The canvas, the two
   clip canvases and the hotspot overlay never unmount between those routes. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { HeroVault, type VaultFx } from "../components/HeroVault";
import { VaultSceneContext, type VaultScene } from "../lib/vaultScene";

/* the single horizontal anchor, as a percentage of the viewport width */
export const HERO_X = 61.8;
export const SIGNUP_X = 76.4;

export default function VaultLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [returning, setReturning] = useState(false);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const shiftRef = useRef<HTMLDivElement | null>(null);
  const rimRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const signupRef = useRef<HTMLAnchorElement | null>(null);
  const signinRef = useRef<HTMLAnchorElement | null>(null);
  const fx = useRef<VaultFx | null>(null);
  const heroExit = useRef<(() => void) | null>(null);
  const anchor = useRef({ v: pathname === "/signup" ? SIGNUP_X : HERO_X });
  const reduced = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ).current;

  const writeAnchor = useCallback((v: number) => {
    anchor.current.v = v;
    shiftRef.current?.style.setProperty("--vault-x", String(v));
  }, []);

  /* the first paint takes the route's anchor with no tween */
  useEffect(() => {
    writeAnchor(pathname === "/signup" ? SIGNUP_X : HERO_X);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tweenAnchor = useCallback(
    (to: number, duration = 1, ease = "power3.inOut") => {
      if (reduced) {
        writeAnchor(to);
        return;
      }
      gsap.to(anchor.current, {
        v: to,
        duration,
        ease,
        overwrite: "auto",
        onUpdate: () => writeAnchor(anchor.current.v),
      });
    },
    [reduced, writeAnchor]
  );

  /* slice 1: the route swap only. The timeline replaces this in slice 2. */
  const startSignup = useCallback(() => {
    tweenAnchor(SIGNUP_X, 1);
    navigate("/signup");
  }, [navigate, tweenAnchor]);

  const registerHeroExit = useCallback((fn: (() => void) | null) => {
    heroExit.current = fn;
  }, []);

  /* the vault element identity is the proof it was not remounted by a route */
  useEffect(() => {
    const w = window as Window & { __vaultCanvas?: Element | null };
    w.__vaultCanvas = wrapRef.current?.querySelector(".hero-canvas") ?? null;
    console.info("[vault] layout mounted");
  }, []);

  useEffect(() => {
    if (pathname !== "/signup") setReturning(false);
  }, [pathname]);

  const scene = useMemo<VaultScene>(
    () => ({
      fx,
      pageRef,
      stageWrapRef: wrapRef,
      rimRef,
      glowRef,
      signupRef,
      signinRef,
      ready,
      reduced,
      returning,
      startSignup,
      registerHeroExit,
    }),
    [ready, reduced, returning, startSignup, registerHeroExit]
  );

  return (
    <VaultSceneContext.Provider value={scene}>
      <div className="hero-page" ref={pageRef}>
        <div className="hero-shell">
          <div className="hero-stage-wrap" ref={wrapRef}>
            <div className="vault-shift" ref={shiftRef}>
              <HeroVault
                ref={fx}
                rimRef={rimRef}
                glowRef={glowRef}
                signinAnchorRef={signinRef}
                onReady={() => setReady(true)}
              />
            </div>
          </div>
          <Outlet />
        </div>
      </div>
    </VaultSceneContext.Provider>
  );
}
