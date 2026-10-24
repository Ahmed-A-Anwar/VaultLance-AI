/* HeroButtons.tsx — wires the two hero CTAs to vault reactions, press states,
   tap behavior and routing. Hover reactions are desktop-only. Sign up drives the
   wheel image-sequence clip and Sign in drives the keypad clip; only one of the
   two clips is ever on screen. */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import type { RefObject } from "react";
import type { VaultFx } from "./HeroVault";
import { CLIPS, FX } from "../config/fx";
import keypadManifest from "../config/keypad-manifest.json";
import { createClipPlayer, discoverFrames, type ClipPlayer } from "../lib/clipPlayer";

export interface HeroButtonsProps {
  signupRef: RefObject<HTMLAnchorElement | null>;
  signinRef: RefObject<HTMLAnchorElement | null>;
  fx: RefObject<VaultFx | null>;
  reducedMotion: boolean;
  signupHref: string;
  signinHref: string;
}

const KEYPAD_FRAMES: string[] = keypadManifest;
const KEYPAD_COUNT = KEYPAD_FRAMES.length;
/* frame at which the keys are fully lit and idle, before code entry */
const K1 = Math.round(KEYPAD_COUNT * CLIPS.keypad.k1Fraction);

const finePointer = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/* no phone-sized keypad frame set, so the clip is desktop-only and phones keep
   the flat v2 keys */
const padViewport = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

const whenIdle = (cb: () => void) => {
  const w = window as Window & {
    requestIdleCallback?: (fn: IdleRequestCallback, opts?: IdleRequestOptions) => number;
  };
  /* the timeout keeps the decode from being starved by the entrance animation */
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(() => cb(), { timeout: 400 });
  else window.setTimeout(cb, 300);
};

export default function HeroButtons({
  signupRef,
  signinRef,
  fx,
  reducedMotion,
  signupHref,
  signinHref,
}: HeroButtonsProps) {
  const navigate = useNavigate();
  const armed = useRef({ signup: false, signin: false });

  useEffect(() => {
    const up = signupRef.current;
    const signin = signinRef.current;
    if (!up || !signin) return;
    const canHover = finePointer() && !reducedMotion;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timers.push(id);
      return id;
    };

    /* ---------- clips ---------- */
    let wheel: ClipPlayer | null = null;
    let pad: ClipPlayer | null = null;
    let wheelLoading = false;
    let padLoading = false;
    let wheelNav = false;
    let padNav = false;
    /* true while the pointer/focus/tap is on a button, so a clip that finishes
       loading mid-hover starts on its own instead of waiting for a re-hover */
    let hoveringUp = false;
    let hoveringIn = false;

    const wheelLayer = FX.wheelClip && !reducedMotion ? fx.current?.getClipLayer() : null;
    if (wheelLayer?.canvas) {
      wheel = createClipPlayer({
        canvas: wheelLayer.canvas,
        fps: CLIPS.wheel.fps,
        getRect: wheelLayer.getRect,
        onArrive: () => {
          if (!wheelNav) return;
          wheelNav = false;
          navigate(signupHref);
        },
        onHidden: () => fx.current?.setClipActive(false),
      });
    }

    const padLayer =
      FX.keypadClip && !reducedMotion && KEYPAD_COUNT > 0 && padViewport()
        ? fx.current?.getKeypadLayer()
        : null;
    if (padLayer?.canvas) {
      pad = createClipPlayer({
        canvas: padLayer.canvas,
        fps: CLIPS.keypad.fps,
        getRect: padLayer.getRect,
        warning: "[fx] keypad clip unavailable — Sign in keeps the static vault",
        onArrive: () => {
          if (!padNav) return;
          padNav = false;
          navigate(signinHref);
        },
        onHidden: () => fx.current?.setKeypadClipActive(false),
      });
      console.log(`[fx] keypad clip: ${KEYPAD_COUNT} frames, K1 = ${K1}`);
    }

    /* one clip at a time: the other is cut instantly, no overlap */
    const startWheel = () => {
      if (!wheel?.ready()) return;
      pad?.hideNow();
      fx.current?.setClipActive(true);
      wheel.playTo(wheel.last());
    };
    const startPad = (to: number) => {
      if (!pad?.ready()) return;
      wheel?.hideNow();
      fx.current?.setKeypadClipActive(true);
      pad.playTo(to);
    };

    const requestWheel = () => {
      if (!wheel || wheelLoading || wheel.ready()) return;
      const p = wheel;
      wheelLoading = true;
      discoverFrames(CLIPS.wheel.dir)
        .then((urls) => p.load(urls))
        .then((ok) => {
          wheelLoading = false;
          if (!ok) {
            p.dispose();
            if (wheel === p) wheel = null;
            return;
          }
          if (hoveringUp) startWheel();
        })
        .catch(() => {
          wheelLoading = false;
        });
    };

    const requestPad = () => {
      if (!pad || padLoading || pad.ready()) return;
      const p = pad;
      padLoading = true;
      p.load(KEYPAD_FRAMES)
        .then((ok) => {
          padLoading = false;
          if (!ok) {
            p.dispose();
            if (pad === p) pad = null;
            return;
          }
          if (hoveringIn) startPad(K1);
        })
        .catch(() => {
          padLoading = false;
        });
    };

    /* the wheel streams as soon as the entrance is under way, so the first hover
       plays on the click instead of waiting for the decode */
    if (wheel) later(() => whenIdle(requestWheel), 200);
    /* the keypad streams once the entrance has landed */
    if (pad) later(() => whenIdle(requestPad), 2618);

    /* ---------- buttons ---------- */
    const lift = (el: HTMLElement, on: boolean) => {
      gsap.to(el, { y: on ? -2 : 0, duration: 0.382, ease: "power2.out", overwrite: "auto" });
      const arrow = el.querySelector("svg");
      if (arrow) gsap.to(arrow, { x: on ? 5 : 0, duration: 0.382, ease: "power2.out", overwrite: "auto" });
    };

    const enterUp = () => {
      hoveringUp = true;
      if (wheel?.ready()) startWheel();
      else if (wheel) requestWheel();
      fx.current?.signUpHover(true);
      lift(up, true);
    };
    const leaveUp = () => {
      hoveringUp = false;
      if (wheel?.ready()) wheel.reverseTo(0);
      fx.current?.signUpHover(false);
      lift(up, false);
    };
    const enterIn = () => {
      hoveringIn = true;
      if (pad?.ready()) startPad(K1);
      else if (pad) requestPad();
      fx.current?.signInHover(true);
    };
    const leaveIn = () => {
      hoveringIn = false;
      if (pad?.ready()) pad.reverseTo(0);
      fx.current?.signInHover(false);
    };

    const press = (el: HTMLElement) =>
      gsap.to(el, { scale: 0.97, duration: 0.236, ease: "power2.out", overwrite: "auto" });
    const release = (el: HTMLElement) =>
      gsap.to(el, { scale: 1, duration: 0.236, ease: "power2.out", overwrite: "auto" });

    const depart = (href: string) => later(() => navigate(href), 1000);

    const clickUp = (e: MouseEvent) => {
      e.preventDefault();
      if (reducedMotion) return navigate(signupHref);
      if (wheel?.ready()) {
        const atEnd = wheel.index() >= wheel.last();
        startWheel();
        if (atEnd) {
          depart(signupHref);
          return;
        }
        wheelNav = true;
        later(() => {
          if (!wheelNav) return;
          wheelNav = false;
          navigate(signupHref);
        }, 2618);
        return;
      }
      requestWheel();
      depart(signupHref);
    };

    const clickIn = (e: MouseEvent) => {
      e.preventDefault();
      if (reducedMotion) return navigate(signinHref);
      if (pad?.ready()) {
        const atEnd = pad.index() >= pad.last();
        startPad(pad.last());
        if (atEnd) {
          depart(signinHref);
          return;
        }
        padNav = true;
        later(() => {
          if (!padNav) return;
          padNav = false;
          navigate(signinHref);
        }, 2618);
        return;
      }
      requestPad();
      fx.current?.signInClick();
      depart(signinHref);
    };

    /* touch: first tap runs to the hold frame, second tap follows the link */
    const tapUp = (e: TouchEvent) => {
      if (canHover || reducedMotion) return;
      requestWheel();
      if (!armed.current.signup) {
        e.preventDefault();
        armed.current.signup = true;
        hoveringUp = true;
        if (wheel?.ready()) startWheel();
        fx.current?.signUpHover(true);
      }
    };
    const tapIn = (e: TouchEvent) => {
      if (canHover || reducedMotion) return;
      requestPad();
      if (!armed.current.signin) {
        e.preventDefault();
        armed.current.signin = true;
        if (pad?.ready()) {
          hoveringIn = true;
          startPad(K1);
        } else {
          fx.current?.signInHover(true);
          later(() => fx.current?.signInHover(false), 1200);
        }
      }
    };

    if (canHover) {
      up.addEventListener("mouseenter", enterUp);
      up.addEventListener("mouseleave", leaveUp);
      signin.addEventListener("mouseenter", enterIn);
      signin.addEventListener("mouseleave", leaveIn);
      up.addEventListener("focus", enterUp);
      up.addEventListener("blur", leaveUp);
      signin.addEventListener("focus", enterIn);
      signin.addEventListener("blur", leaveIn);
    }
    up.addEventListener("pointerdown", () => press(up));
    up.addEventListener("pointerup", () => release(up));
    signin.addEventListener("pointerdown", () => press(signin));
    signin.addEventListener("pointerup", () => release(signin));
    up.addEventListener("click", clickUp);
    signin.addEventListener("click", clickIn);
    up.addEventListener("touchstart", tapUp, { passive: false });
    signin.addEventListener("touchstart", tapIn, { passive: false });

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      up.removeEventListener("mouseenter", enterUp);
      up.removeEventListener("mouseleave", leaveUp);
      up.removeEventListener("focus", enterUp);
      up.removeEventListener("blur", leaveUp);
      signin.removeEventListener("mouseenter", enterIn);
      signin.removeEventListener("mouseleave", leaveIn);
      signin.removeEventListener("focus", enterIn);
      signin.removeEventListener("blur", leaveIn);
      up.removeEventListener("click", clickUp);
      signin.removeEventListener("click", clickIn);
      up.removeEventListener("touchstart", tapUp);
      signin.removeEventListener("touchstart", tapIn);
      wheel?.dispose();
      pad?.dispose();
    };
  }, [signupRef, signinRef, fx, reducedMotion, signupHref, signinHref, navigate]);

  return null;
}
