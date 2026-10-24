/* HeroButtons.tsx — wires the two hero CTAs to vault reactions, press states,
   tap behavior and routing. Hover reactions are desktop-only. The Sign up
   button also drives the wheel image-sequence clip when FX.wheelClip is on. */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import type { RefObject } from "react";
import type { VaultFx } from "./HeroVault";
import { CLIPS, FX } from "../config/fx";
import { createClipPlayer, discoverFrames, type ClipPlayer } from "../lib/clipPlayer";

export interface HeroButtonsProps {
  signupRef: RefObject<HTMLAnchorElement | null>;
  signinRef: RefObject<HTMLAnchorElement | null>;
  fx: RefObject<VaultFx | null>;
  reducedMotion: boolean;
  signupHref: string;
  signinHref: string;
}

const finePointer = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const whenIdle = (cb: () => void) => {
  const w = window as Window & { requestIdleCallback?: (fn: IdleRequestCallback) => number };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(() => cb());
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

    /* ---------- wheel clip, Sign up only ---------- */
    let player: ClipPlayer | null = null;
    let loading = false;
    let pendingNav = false;
    const layer = FX.wheelClip && !reducedMotion ? fx.current?.getClipLayer() : null;

    if (layer?.canvas) {
      player = createClipPlayer({
        canvas: layer.canvas,
        fps: CLIPS.wheel.fps,
        getRect: layer.getRect,
        onArrive: () => {
          if (!pendingNav) return;
          pendingNav = false;
          navigate(signupHref);
        },
        onHidden: () => fx.current?.setClipActive(false),
      });
    }

    const requestClip = () => {
      if (!player || loading || player.ready()) return;
      const p = player;
      loading = true;
      discoverFrames(CLIPS.wheel.dir)
        .then((urls) => p.load(urls))
        .then((ok) => {
          loading = false;
          if (!ok) {
            p.dispose();
            if (player === p) player = null;
          }
        })
        .catch(() => {
          loading = false;
        });
    };

    /* load after the entrance lands, or on the first hover/focus/tap */
    if (player) later(() => whenIdle(requestClip), 2618);

    /* ---------- buttons ---------- */
    const lift = (el: HTMLElement, on: boolean) => {
      gsap.to(el, { y: on ? -2 : 0, duration: 0.382, ease: "power2.out", overwrite: "auto" });
      const arrow = el.querySelector("svg");
      if (arrow) gsap.to(arrow, { x: on ? 5 : 0, duration: 0.382, ease: "power2.out", overwrite: "auto" });
    };

    const enterUp = () => {
      if (player?.ready()) {
        fx.current?.setClipActive(true);
        player.playTo(player.last());
      } else if (player) {
        requestClip();
      }
      fx.current?.signUpHover(true);
      lift(up, true);
    };
    const leaveUp = () => {
      if (player?.ready()) player.reverseTo(0);
      fx.current?.signUpHover(false);
      lift(up, false);
    };
    const enterIn = () => fx.current?.signInHover(true);
    const leaveIn = () => fx.current?.signInHover(false);

    const press = (el: HTMLElement) =>
      gsap.to(el, { scale: 0.97, duration: 0.236, ease: "power2.out", overwrite: "auto" });
    const release = (el: HTMLElement) =>
      gsap.to(el, { scale: 1, duration: 0.236, ease: "power2.out", overwrite: "auto" });

    const depart = (href: string) => later(() => navigate(href), 1000);

    const clickUp = (e: MouseEvent) => {
      e.preventDefault();
      if (reducedMotion) return navigate(signupHref);
      if (player?.ready()) {
        const atEnd = player.index() >= player.last();
        fx.current?.setClipActive(true);
        player.playTo(player.last());
        if (atEnd) {
          depart(signupHref);
          return;
        }
        pendingNav = true;
        later(() => {
          if (!pendingNav) return;
          pendingNav = false;
          navigate(signupHref);
        }, 2618);
        return;
      }
      requestClip();
      fx.current?.signUpClick();
      depart(signupHref);
    };
    const clickIn = (e: MouseEvent) => {
      e.preventDefault();
      if (reducedMotion) return navigate(signinHref);
      fx.current?.signInClick();
      depart(signinHref);
    };

    /* touch: first tap reveals the reaction, second tap follows the link */
    const tapUp = (e: TouchEvent) => {
      if (canHover || reducedMotion) return;
      requestClip();
      if (!armed.current.signup) {
        e.preventDefault();
        armed.current.signup = true;
        if (player?.ready()) {
          fx.current?.setClipActive(true);
          player.playTo(player.last());
        }
        fx.current?.signUpHover(true);
      }
    };
    const tapIn = (e: TouchEvent) => {
      if (canHover || reducedMotion) return;
      if (!armed.current.signin) {
        e.preventDefault();
        armed.current.signin = true;
        fx.current?.signInHover(true);
        later(() => fx.current?.signInHover(false), 1200);
      }
    };

    if (canHover) {
      up.addEventListener("mouseenter", enterUp);
      up.addEventListener("mouseleave", leaveUp);
      signin.addEventListener("mouseenter", enterIn);
      signin.addEventListener("mouseleave", leaveIn);
      up.addEventListener("focus", enterUp);
      up.addEventListener("blur", leaveUp);
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
      up.removeEventListener("click", clickUp);
      signin.removeEventListener("click", clickIn);
      up.removeEventListener("touchstart", tapUp);
      signin.removeEventListener("touchstart", tapIn);
      player?.dispose();
    };
  }, [signupRef, signinRef, fx, reducedMotion, signupHref, signinHref, navigate]);

  return null;
}
