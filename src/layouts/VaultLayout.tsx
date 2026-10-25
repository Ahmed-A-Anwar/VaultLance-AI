/* VaultLayout.tsx — the vault is mounted once, here, and every route renders
   inside it. "/" puts the hero copy beside it; "/signup" puts the form card in
   the left column and slides the vault to its signup anchor. The canvas, the two
   clip canvases and the hotspot overlay never unmount between those routes.

   Transition ownership: this file runs one timeline. The hero leaves as a frozen
   copy of itself (so its exit keeps playing after the route swaps), the vault
   slides, and the card joins the same timeline once React has mounted it. Going
   back runs the mirror image. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { HeroVault, type VaultFx } from "../components/HeroVault";
import { VaultSceneContext, type VaultScene } from "../lib/vaultScene";
import { CLIPS, FX } from "../config/fx";
import keypadManifest from "../config/keypad-manifest.json";

/* the single horizontal anchor, as a percentage of the viewport width */
export const HERO_X = 61.8;
export const SIGNUP_X = 76.4;
/* the same column as /signup: the two decks are one place, crossfaded */
export const SIGNIN_X = 76.4;

/* the two form decks live at the same anchor, so only the card changes */
const DECK: Record<string, number> = { "/signup": SIGNUP_X, "/signin": SIGNIN_X };
const anchorFor = (pathname: string) => DECK[pathname] ?? HERO_X;

/* timeline positions, from the 0.236 / 0.382 / 0.618 / 1 / 1.618 ledger */
const T_VAULT = 1;
const T_HERO = 0.618;
const T_CARD = 0.618;
const T_CARD_KIDS = 1;

/* phones get the vertical version of the same move: the copy leaves downward and
   the form rises in; the vault never slides sideways */
const isVertical = () => typeof window !== "undefined" && window.innerWidth < 768;

/* the keypad clip, and the frame where the keys are fully lit and idle */
const KEYPAD_FRAMES: string[] = keypadManifest;
const K1 = Math.round(KEYPAD_FRAMES.length * CLIPS.keypad.k1Fraction);
const K1_URL = KEYPAD_FRAMES[K1];

/* a detached element parked exactly where it was, so it can animate out after
   its route has unmounted */
function freeze(el: HTMLElement): HTMLElement {
  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.classList.add("scene-ghost");
  Object.assign(ghost.style, {
    inset: "auto",
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "30",
  });
  document.body.appendChild(ghost);
  return ghost;
}

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
  const anchor = useRef({ v: anchorFor(pathname) });
  const cardMode = useRef<"instant" | "animated">("instant");
  /* the keypad warning is printed once per session, not once per route */
  const padWarned = useRef(false);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const cardRect = useRef<DOMRect | null>(null);
  const ghostRef = useRef<HTMLElement | null>(null);
  const reduced = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ).current;

  const writeAnchor = useCallback((v: number) => {
    anchor.current.v = v;
    shiftRef.current?.style.setProperty("--vault-x", String(v));
  }, []);

  /* the first paint takes the route's anchor with no tween */
  useLayoutEffect(() => {
    writeAnchor(anchorFor(pathname));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tweenVault = useCallback(
    (tl: gsap.core.Timeline, to: number, at = 0) => {
      tl.to(
        anchor.current,
        {
          v: to,
          duration: T_VAULT,
          ease: "power3.inOut",
          onUpdate: () => writeAnchor(anchor.current.v),
        },
        at
      );
    },
    [writeAnchor]
  );

  /* ---- forward: Sign up, wheel landed ---- */

  const startSignup = useCallback(() => {
    timeline.current?.kill();
    timeline.current = null;
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }

    if (reduced) {
      cardMode.current = "instant";
      writeAnchor(SIGNUP_X);
      navigate("/signup");
      return;
    }

    cardMode.current = "animated";
    const vertical = isVertical();
    const hero = pageRef.current?.querySelector<HTMLElement>(".hero-layout") ?? null;
    const ghost = hero ? freeze(hero) : null;
    const items = ghost
      ? Array.from(ghost.querySelectorAll<HTMLElement>(".hero-copy > *"))
      : [];

    const tl = gsap.timeline({
      onComplete: () => {
        if (ghost) ghost.remove();
        if (ghostRef.current === ghost) ghostRef.current = null;
        if (timeline.current === tl) timeline.current = null;
      },
    });
    tweenVault(tl, SIGNUP_X, 0);
    if (items.length) {
      tl.to(
        items,
        {
          ...(vertical ? { y: 89 } : { x: -89 }),
          opacity: 0,
          duration: T_HERO,
          stagger: 0.0618,
          ease: "power3.in",
        },
        0
      );
    }
    timeline.current = tl;
    ghostRef.current = ghost;
    navigate("/signup");
  }, [navigate, reduced, tweenVault, writeAnchor]);

  /* ---- the card joins the running timeline, or renders final ---- */

  const registerSignupCard = useCallback((card: HTMLElement) => {
    cardRef.current = card;
    cardRect.current = card.getBoundingClientRect();
  }, []);

  /* /signin's card parked in the same slots: one deck is on screen at a time, so
     the way back can freeze whichever card is mounted */
  const registerSigninCard = registerSignupCard;

  const enterSignupCard = useCallback((card: HTMLElement) => {
    if (cardMode.current !== "animated") return;
    const tl = timeline.current;
    if (!tl || card.dataset.entered === "true") return;
    card.dataset.entered = "true";

    const kids = Array.from(card.querySelectorAll<HTMLElement>("[data-reveal]"));
    gsap.set(card, isVertical() ? { y: 89, x: 0 } : { x: -89, y: 0 });
    gsap.set(card, { opacity: 0 });
    if (kids.length) gsap.set(kids, { y: 21, opacity: 0 });
    tl.to(card, { x: 0, y: 0, opacity: 1, duration: T_CARD, ease: "power3.out" }, T_CARD);
    if (kids.length) {
      tl.to(
        kids,
        { y: 0, opacity: 1, duration: T_CARD, stagger: 0.1, ease: "power3.out" },
        T_CARD_KIDS
      );
    }
    tl.call(
      () => {
        gsap.set(card, { clearProps: "transform,opacity" });
        if (kids.length) gsap.set(kids, { clearProps: "transform,opacity" });
      },
      undefined,
      T_CARD_KIDS + T_CARD
    );
  }, []);

  /* ---- /signin: same deck, same timeline family ---- */

  /* the lit keypad is painted into the vault's own canvas, the way /signup keeps
     the landed wheel: the still survives the hero's clip player being disposed,
     a resize and the route change, so nothing can flash the keys dark on the way
     in. A missing frame set falls back to the flat CSS keys. */
  const padHold = useCallback(async () => {
    if (!FX.keypadClip) return false;
    const loaded = await new Promise<boolean>((res) => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = K1_URL;
    });
    if (!loaded) {
      if (!padWarned.current) {
        padWarned.current = true;
        console.warn("[fx] keypad clip unavailable — Sign in keeps the static keypad");
      }
      return false;
    }
    await fx.current?.holdFrame(K1_URL);
    return true;
  }, []);

  const startSignin = useCallback(() => {
    timeline.current?.kill();
    timeline.current = null;
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
    writeAnchor(SIGNIN_X);

    if (reduced) {
      cardMode.current = "instant";
      navigate("/signin");
      return;
    }
    cardMode.current = "animated";
    /* the still goes in first and the route follows it, so the clip canvas can be
       cleared on unmount without the keypad blinking out */
    void padHold().then((ok) => {
      if (!ok) fx.current?.signInHover(true);
      navigate("/signin");
    });
  }, [navigate, padHold, reduced, writeAnchor]);

  const enterSigninCard = useCallback((_card: HTMLElement) => {
    /* the entrance joins the running timeline once the transition lands */
  }, []);

  const padEnter = useCallback(async () => {
    /* the code-entry tail of the keypad clip */
  }, []);

  /* ---- back: /signup -> / ---- */

  const prevPath = useRef(pathname);
  const arrivingBack = pathname === "/" && prevPath.current === "/signup";
  if (arrivingBack && !returning) setReturning(true);

  useLayoutEffect(() => {
    const back = arrivingBack;
    prevPath.current = pathname;
    if (pathname === "/signup") {
      setReturning(false);
      /* no transition is running when /signup is reached by history or a plain
         link, so the vault lands on the signup anchor itself instead of staying
         at the hero's and leaving the card on top of the wheel */
      if (cardMode.current !== "animated") writeAnchor(SIGNUP_X);
      return;
    }
    if (!back) return;

    timeline.current?.kill();
    timeline.current = null;
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }

    /* the signup page shows the landed wheel as the vault's own frame; home puts
       f_001 back and gives the seam overlay to the Sign in hover again */
    void fx.current?.holdFrame(null);
    fx.current?.setClipActive(false);

    const card = cardRef.current;
    const rect = cardRect.current;

    if (reduced) {
      cardMode.current = "instant";
      writeAnchor(HERO_X);
      card?.remove();
      return;
    }

    cardMode.current = "instant";
    if (card && rect) {
      Object.assign(card.style, {
        inset: "auto",
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: "0",
        pointerEvents: "none",
        zIndex: "30",
      });
      card.setAttribute("aria-hidden", "true");
      document.body.appendChild(card);
      ghostRef.current = card;
    }

    const kids = card ? Array.from(card.querySelectorAll<HTMLElement>("[data-reveal]")) : [];
    const tl = gsap.timeline({
      onComplete: () => {
        card?.remove();
        if (ghostRef.current === card) ghostRef.current = null;
        if (timeline.current === tl) timeline.current = null;
      },
    });
    tweenVault(tl, HERO_X, 0);
    if (kids.length) {
      tl.to(
        kids,
        { y: 21, opacity: 0, duration: 0.382, stagger: 0.0618, ease: "power3.in" },
        0
      );
    }
    if (card) {
      const vertical = isVertical();
      tl.to(
        card,
        { ...(vertical ? { y: 89 } : { x: -89 }), opacity: 0, duration: 0.382, ease: "power3.in" },
        0.226
      );
    }
    timeline.current = tl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /* the vault element identity is the proof it was not remounted by a route */
  useEffect(() => {
    const w = window as Window & { __vaultCanvas?: Element | null };
    w.__vaultCanvas = wrapRef.current?.querySelector(".hero-canvas") ?? null;
    console.info("[vault] layout mounted");
    /* both decks are lazy routes: warm their modules here so the change of route
       costs nothing at the moment the clip lands */
    void import("../pages/Signup");
    void import("../pages/Signin");
  }, []);

  /* only the nodes this layout parked itself; the card belongs to React while
     it is mounted (and StrictMode's test unmount must not eat it) */
  useEffect(
    () => () => {
      timeline.current?.kill();
      ghostRef.current?.remove();
    },
    []
  );

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
      startSignin,
      enterSignupCard,
      enterSigninCard,
      registerSignupCard,
      registerSigninCard,
      padEnter,
    }),
    [
      ready,
      reduced,
      returning,
      startSignup,
      startSignin,
      enterSignupCard,
      enterSigninCard,
      registerSignupCard,
      registerSigninCard,
      padEnter,
    ]
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
