/* HeroButtons.tsx — wires the two hero CTAs to vault reactions, press states,
   tap behavior and routing. Hover reactions are desktop-only. */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import type { RefObject } from "react";
import type { VaultFx } from "./HeroVault";

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

    const enterUp = () => {
      fx.current?.signUpHover(true);
      gsap.to(up, { y: -2, duration: 0.382, ease: "power2.out", overwrite: "auto" });
      const arrow = up.querySelector("svg");
      if (arrow) gsap.to(arrow, { x: 5, duration: 0.382, ease: "power2.out", overwrite: "auto" });
    };
    const leaveUp = () => {
      fx.current?.signUpHover(false);
      gsap.to(up, { y: 0, duration: 0.382, ease: "power2.out", overwrite: "auto" });
      const arrow = up.querySelector("svg");
      if (arrow) gsap.to(arrow, { x: 0, duration: 0.382, ease: "power2.out", overwrite: "auto" });
    };
    const enterIn = () => fx.current?.signInHover(true);
    const leaveIn = () => fx.current?.signInHover(false);

    const press = (el: HTMLElement) =>
      gsap.to(el, { scale: 0.97, duration: 0.236, ease: "power2.out", overwrite: "auto" });
    const release = (el: HTMLElement) =>
      gsap.to(el, { scale: 1, duration: 0.236, ease: "power2.out", overwrite: "auto" });

    const depart = (href: string) => timers.push(window.setTimeout(() => navigate(href), 1000));

    const clickUp = (e: MouseEvent) => {
      e.preventDefault();
      if (reducedMotion) return navigate(signupHref);
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
      if (canHover) return;
      if (!armed.current.signup) {
        e.preventDefault();
        armed.current.signup = true;
        fx.current?.signUpHover(true);
        timers.push(window.setTimeout(() => fx.current?.signUpHover(false), 1200));
      }
    };
    const tapIn = (e: TouchEvent) => {
      if (canHover) return;
      if (!armed.current.signin) {
        e.preventDefault();
        armed.current.signin = true;
        fx.current?.signInHover(true);
        timers.push(window.setTimeout(() => fx.current?.signInHover(false), 1200));
      }
    };

    if (canHover) {
      up.addEventListener("mouseenter", enterUp);
      up.addEventListener("mouseleave", leaveUp);
      signin.addEventListener("mouseenter", enterIn);
      signin.addEventListener("mouseleave", leaveIn);
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
      signin.removeEventListener("mouseenter", enterIn);
      signin.removeEventListener("mouseleave", leaveIn);
      up.removeEventListener("click", clickUp);
      signin.removeEventListener("click", clickIn);
      up.removeEventListener("touchstart", tapUp);
      signin.removeEventListener("touchstart", tapIn);
    };
  }, [signupRef, signinRef, fx, reducedMotion, signupHref, signinHref, navigate]);

  return null;
}
