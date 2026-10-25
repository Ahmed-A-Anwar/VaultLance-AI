/* VaultLayout.tsx — the vault is mounted once, here, and every route renders
   inside it. "/" puts the hero copy beside it; "/signup" and "/signin" put their
   card in the left column and slide the vault to the deck anchor. The two decks
   share that anchor, so moving between them only swaps the card. The canvas, the
   two clip canvases and the hotspot overlay never unmount between those routes.

   Transition ownership: this file runs one timeline. The hero leaves as a frozen
   copy of itself (so its exit keeps playing after the route swaps), the vault
   slides, and the card joins the same timeline once React has mounted it. Going
   back runs the mirror image. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { HeroVault, type VaultFx } from "../components/HeroVault";
import { VaultSceneContext, type VaultScene } from "../lib/vaultScene";
import { createClipPlayer, type ClipPlayer } from "../lib/clipPlayer";
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
const isDeck = (pathname: string) => pathname in DECK;

/* timeline positions, from the 0.236 / 0.382 / 0.618 / 1 / 1.618 ledger */
const T_VAULT = 1;
const T_HERO = 0.618;
const T_CARD = 0.618;
const T_CARD_KIDS = 1;
/* deck to deck: the two cards swap across the same column */
const T_SWAP = 0.382;
const SWAP_X = 34;

/* phones get the vertical version of the same move: the copy leaves downward and
   the form rises in; the vault never slides sideways */
const isVertical = () => typeof window !== "undefined" && window.innerWidth < 768;

/* the keypad clip, and the frame where the keys are fully lit and idle */
const KEYPAD_FRAMES: string[] = keypadManifest;
const K1 = Math.round(KEYPAD_FRAMES.length * CLIPS.keypad.k1Fraction);
const K1_URL = KEYPAD_FRAMES[K1];

/* a detached element parked exactly where it was, so it can animate out after
   its route has unmounted */
function park(el: HTMLElement, rect: DOMRect) {
  Object.assign(el.style, {
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
  el.setAttribute("aria-hidden", "true");
  el.classList.add("scene-ghost");
}

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
  /* the keypad still could not be loaded: /signin shows the flat CSS keys */
  const [padFail, setPadFail] = useState(false);

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
  /* the deck that was on screen a moment ago, kept for the crossfade */
  const outgoing = useRef<{ el: HTMLElement; rect: DOMRect } | null>(null);
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

  /* ---- the /signin keypad ----
     The lit keypad is painted into the vault's own canvas, the way /signup keeps
     the landed wheel: the still survives the hero's clip player being disposed,
     a resize and the route change, so nothing flashes the keys dark on the way
     in. The players below only animate away from that still. */

  const padPlayer = useRef<ClipPlayer | null>(null);
  const padRole = useRef<"enter" | "leave" | "wave" | null>(null);
  const padArrive = useRef<(() => void) | null>(null);
  /* the ref mirrors padFail so the action callbacks can skip the clip without
     waiting for a render (and without a second console warning) */
  const padFailRef = useRef(false);

  const makePad = useCallback(
    (role: "enter" | "leave" | "wave") => {
      const layer = fx.current?.getKeypadLayer();
      if (!layer?.canvas) return null;
      padPlayer.current?.dispose();
      padRole.current = role;
      const holder: { p: ClipPlayer | null } = { p: null };
      const p = createClipPlayer({
        canvas: layer.canvas,
        fps: CLIPS.keypad.fps,
        getRect: layer.getRect,
        warning: "[fx] keypad clip unavailable — Sign in keeps the static keypad",
        onArrive: () => {
          /* the way out runs the keys back to frame 0, then crossfades the clip
             out onto the dark still */
          if (padRole.current === "leave") {
            holder.p?.reverseTo(holder.p.last());
            return;
          }
          const settle = padArrive.current;
          padArrive.current = null;
          settle?.();
        },
        onHidden: () => {
          fx.current?.setKeypadClipActive(false);
          if (padRole.current === "leave" && padPlayer.current === holder.p) {
            holder.p?.dispose();
            padPlayer.current = null;
          }
        },
      });
      holder.p = p;
      padPlayer.current = p;
      return { player: p, holder };
    },
    [fx]
  );

  /* paint K1 into the vault and hold it there */
  const padHold = useCallback(async () => {
    if (!FX.keypadClip) {
      padFailRef.current = true;
      setPadFail(true);
      return false;
    }
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
      padFailRef.current = true;
      setPadFail(true);
      return false;
    }
    await fx.current?.holdFrame(K1_URL);
    /* the still carries the keypad's own LED, so the flat overlay goes away */
    fx.current?.setKeypadClipActive(true);
    return true;
  }, []);

  /* code entry: K1 to the last frame, over the still that is already on screen */
  const padEnter = useCallback(async () => {
    if (reduced || !FX.keypadClip || padFailRef.current) return;
    const urls = KEYPAD_FRAMES.slice(K1);
    const made = makePad("enter");
    if (!made) return;
    const ok = await made.player.load(urls);
    if (!ok) return;
    const tl = new Promise<void>((res) => {
      padArrive.current = res;
      made.player.playTo(made.player.last());
      window.setTimeout(res, 2618);
    });
    await tl;
  }, [makePad, reduced]);

  /* /signup -> /signin: the keys light from frame 0 to K1, then the frame is
     handed to the still so the rest of the page holds it */
  const padWave = useCallback(async () => {
    if (reduced || !FX.keypadClip) return;
    const made = makePad("wave");
    if (!made) return;
    const ok = await made.player.load(KEYPAD_FRAMES);
    if (!ok) return;
    fx.current?.setKeypadClipActive(true);
    await new Promise<void>((res) => {
      padArrive.current = res;
      made.player.playTo(K1);
      window.setTimeout(res, 2618);
    });
    await fx.current?.holdFrame(K1_URL);
    made.player.hideNow();
    made.player.dispose();
    if (padPlayer.current === made.player) padPlayer.current = null;
  }, [makePad, reduced]);

  /* the way out of /signin: K1 runs back down to frame 0, then the clip fades
     out onto the dark still */
  const padReverse = useCallback(() => {
    const layer = fx.current?.getKeypadLayer();
    if (reduced || !FX.keypadClip || padFailRef.current || !layer?.canvas) {
      fx.current?.setKeypadClipActive(false);
      void fx.current?.holdFrame(null);
      return;
    }
    const urls = KEYPAD_FRAMES.slice(0, K1 + 1).reverse();
    const canvas = layer.canvas;
    const made = makePad("leave");
    if (!made) {
      void fx.current?.holdFrame(null);
      return;
    }
    void Promise.race([
      made.player.load(urls),
      new Promise<boolean>((res) => window.setTimeout(() => res(false), 382)),
    ]).then((ok) => {
      if (!ok) {
        made.player.dispose();
        if (padPlayer.current === made.player) padPlayer.current = null;
        void fx.current?.holdFrame(null);
        return;
      }
      fx.current?.setKeypadClipActive(true);
      /* frame K1 is already on the vault, so the clip can take the canvas at
         once and the still underneath can swap to f_001 unseen */
      made.player.playTo(0);
      gsap.killTweensOf(canvas);
      canvas.style.opacity = "1";
      void fx.current?.holdFrame(null);
      made.player.playTo(K1);
    });
  }, [makePad, reduced]);

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

  /* ---- forward: Sign in, keypad at K1 ---- */

  const startSignin = useCallback(() => {
    timeline.current?.kill();
    timeline.current = null;
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }

    if (reduced) {
      cardMode.current = "instant";
      writeAnchor(SIGNIN_X);
      navigate("/signin");
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
    tweenVault(tl, SIGNIN_X, 0);
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
    /* the still goes in before the route does, so the clip canvas can be cleared
       on unmount without the keypad blinking out */
    void padHold().then((ok) => {
      /* the card opens on the flat keys only if the clip is missing */
      if (!ok) fx.current?.signInHover(false);
      navigate("/signin");
    });
  }, [navigate, padHold, reduced, tweenVault, writeAnchor]);

  /* ---- the card joins the running timeline, or renders final ---- */

  const registerCard = useCallback((card: HTMLElement) => {
    if (cardRef.current && cardRef.current !== card) {
      /* the deck that was on screen a moment ago: its rect is the crossfade's
         start, and React has already detached the node, so it cannot be measured
         again after this point */
      outgoing.current = { el: cardRef.current, rect: cardRect.current ?? card.getBoundingClientRect() };
    }
    cardRef.current = card;
    cardRect.current = card.getBoundingClientRect();
    return card;
  }, []);

  const enterCard = useCallback((card: HTMLElement) => {
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

  /* ---- /signup <-> /signin: one column, so only the card swaps ---- */

  const crossfadeDecks = useCallback(
    (to: string) => {
      timeline.current?.kill();
      timeline.current = null;
      if (ghostRef.current) {
        ghostRef.current.remove();
        ghostRef.current = null;
      }
      cardMode.current = "instant";

      const dest = to === "/signin" ? 1 : -1;
      const old = outgoing.current;
      outgoing.current = null;
      const next = cardRef.current;

      /* the keypad follows the deck: lit on /signin, dark again on /signup */
      if (to === "/signin") {
        if (reduced) void padHold();
        else void padWave();
      } else if (reduced) {
        fx.current?.setKeypadClipActive(false);
        fx.current?.resetCtas();
        void fx.current?.holdFrame(null);
      } else {
        fx.current?.resetCtas();
        padReverse();
      }

      if (reduced) {
        old?.el.remove();
        return;
      }

      const tl = gsap.timeline({
        onComplete: () => {
          old?.el.remove();
          if (timeline.current === tl) timeline.current = null;
        },
      });
      if (old) {
        park(old.el, old.rect);
        document.body.appendChild(old.el);
        tl.to(old.el, { x: -SWAP_X * dest, opacity: 0, duration: T_SWAP, ease: "power3.in" }, 0);
      }
      if (next) {
        gsap.set(next, { x: SWAP_X * dest, opacity: 0 });
        tl.to(next, { x: 0, opacity: 1, duration: T_SWAP, ease: "power3.out" }, 0);
        tl.call(() => gsap.set(next, { clearProps: "transform,opacity" }), undefined, T_SWAP);
      }
      timeline.current = tl;
    },
    [padHold, padReverse, padWave, reduced]
  );

  /* ---- back to "/" ---- */

  const prevPath = useRef(pathname);
  const backFrom = prevPath.current;
  const arrivingBack = pathname === "/" && (backFrom === "/signup" || backFrom === "/signin");
  if (arrivingBack && !returning) setReturning(true);

  useLayoutEffect(() => {
    const prev = prevPath.current;
    prevPath.current = pathname;

    /* /signup <-> /signin */
    if (isDeck(prev) && isDeck(pathname) && prev !== pathname) {
      setReturning(false);
      crossfadeDecks(pathname);
      return;
    }

    /* a deck reached by history or a plain link: no transition is running */
    if (isDeck(pathname)) {
      setReturning(false);
      if (cardMode.current !== "animated") {
        writeAnchor(anchorFor(pathname));
        if (pathname === "/signin") void padHold();
      }
      return;
    }

    if (!arrivingBack) return;

    timeline.current?.kill();
    timeline.current = null;
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
    outgoing.current = null;

    /* each deck shows its own frame as the vault's own still: the signup page
       keeps the landed wheel, and the signin page gives the keypad back to the
       dark f_001 on the way out */
    if (prev === "/signin") {
      fx.current?.setClipActive(false);
      fx.current?.resetCtas();
      padReverse();
    } else {
      void fx.current?.holdFrame(null);
      fx.current?.setClipActive(false);
    }

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
      park(card, rect);
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
      outgoing.current?.el.remove();
      padPlayer.current?.dispose();
      padPlayer.current = null;
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
      padFail,
      startSignup,
      startSignin,
      enterSignupCard: enterCard,
      enterSigninCard: enterCard,
      registerSignupCard: registerCard,
      registerSigninCard: registerCard,
      padEnter,
    }),
    [
      ready,
      reduced,
      returning,
      padFail,
      startSignup,
      startSignin,
      enterCard,
      registerCard,
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
