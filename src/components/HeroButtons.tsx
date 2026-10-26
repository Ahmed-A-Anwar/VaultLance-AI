/* HeroButtons.tsx — wires the two hero CTAs to vault reactions, press states,
   tap behavior and routing. Hover reactions are desktop-only. Sign up drives the
   wheel image-sequence clip and Sign in drives the keypad clip; only one of the
   two clips is ever on screen. On entry the vault demos both reactions by itself
   — keypad lights and runs back down, then one wheel turn — before a pointer. */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import type { RefObject } from "react";
import type { VaultFx } from "./HeroVault";
import { CLIPS, FX } from "../config/fx";
import keypadManifest from "../config/keypad-manifest.json";
import wheelManifest from "../config/wheel-manifest.json";
import { createClipPlayer, discoverFrames, type ClipPlayer } from "../lib/clipPlayer";
import { useVaultScene, type VaultClipsHandle } from "../lib/vaultScene";

export interface HeroButtonsProps {
  signupRef: RefObject<HTMLAnchorElement | null>;
  signinRef: RefObject<HTMLAnchorElement | null>;
  fx: RefObject<VaultFx | null>;
  /* published for the entry gate, which waits on these two clips */
  clips: RefObject<VaultClipsHandle | null>;
  booted: boolean;
  reducedMotion: boolean;
  /* Sign up hands off to the signup transition, which owns the navigation */
  onSignup: () => void;
  signinHref: string;
}

const KEYPAD_FRAMES: string[] = keypadManifest;
const KEYPAD_COUNT = KEYPAD_FRAMES.length;
/* listed at build time, so the entry gate has a denominator before the request
   goes out; discovery stays as the fallback for a folder with no manifest */
const WHEEL_FRAMES: string[] = wheelManifest;
/* frame at which the keys are fully lit and idle, before code entry */
const K1 = Math.round(KEYPAD_COUNT * CLIPS.keypad.k1Fraction);

const finePointer = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/* no phone-sized keypad frame set, so the clip is desktop-only and phones keep
   the flat v2 keys */
const padViewport = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

/* ---------- entrance intro ---------- */
/* the entrance timeline lands at 2.618s; the clips start after it */
const INTRO_DELAY = 2618;
/* beat on the lit keypad before the keys run back down */
const INTRO_HOLD = 618;

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
  clips,
  booted,
  reducedMotion,
  onSignup,
  signinHref,
}: HeroButtonsProps) {
  const navigate = useNavigate();
  /* read in the effect below without re-running it: the gate opens mid-load and
     a dependency on it would tear the players down and start the decode again */
  const bootedRef = useRef(booted);
  bootedRef.current = booted;
  /* the signin transition lives in the layout, which owns the vault and the
     route swap; this file only decides when the keypad has gone far enough */
  const { startSignin } = useVaultScene();
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
    /* the wheel's frame urls: its last one is what the signup page keeps */
    let wheelUrls: string[] = [];
    let wheelLoading = false;
    let padLoading = false;
    let wheelNav = false;
    let padNav = false;
    /* true while the pointer/focus/tap is on a button, so a clip that finishes
       loading mid-hover starts on its own instead of waiting for a re-hover */
    let hoveringUp = false;
    let hoveringIn = false;
    /* resolved when a clip reaches its target frame, so the intro can pace itself
       on the clip itself instead of on guessed durations */
    let wheelArrive: (() => void) | null = null;
    let padArrive: (() => void) | null = null;

    /* the one place a Sign in leaves: through the transition, or straight to the
       link when the flow flag is off */
    const goSignin = () => (FX.signinFlow ? startSignin() : navigate(signinHref));

    const wheelLayer = FX.wheelClip && !reducedMotion ? fx.current?.getClipLayer() : null;
    if (wheelLayer?.canvas) {
      wheel = createClipPlayer({
        canvas: wheelLayer.canvas,
        fps: CLIPS.wheel.fps,
        getRect: wheelLayer.getRect,
        onArrive: () => {
          const settle = wheelArrive;
          wheelArrive = null;
          settle?.();
          if (!wheelNav) return;
          wheelNav = false;
          landWheel();
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
          const settle = padArrive;
          padArrive = null;
          settle?.();
          if (!padNav) return;
          padNav = false;
          goSignin();
        },
        onHidden: () => fx.current?.setKeypadClipActive(false),
      });
      console.log(`[fx] keypad clip: ${KEYPAD_COUNT} frames, K1 = ${K1}`);
    }

    /* what the entry gate measures: the whole wheel, because the intro turns it
       end to end, and the keypad up to K1, which is as far as the intro or a
       Sign in click ever goes before the route takes over */
    const padNeed = K1 + 1;
    /* the wheel's length is discovered from its folder, so there is no total to
       report until the probe has answered: a made-up denominator would make the
       bar jump backwards the moment the real one arrived */
    const wheelNeed = () => (wheel ? (wheel.last() > 0 ? wheel.last() + 1 : 0) : 0);
    const measured = () => !wheel || wheelNeed() > 0;
    const bankedIn = (p: ClipPlayer | null, need: number) => {
      if (!p) return need;
      return Math.max(0, Math.min(need, p.bankedTo() + 1));
    };

    clips.current = {
      progress: () => {
        if (!measured()) return 0;
        const wNeed = wheelNeed();
        const all = wNeed + padNeed;
        return all > 0 ? (bankedIn(wheel, wNeed) + bankedIn(pad, padNeed)) / all : 1;
      },
      ready: () =>
        (!wheel || (wheel.last() > 0 && wheel.bankedTo() >= wheel.last())) &&
        (!pad || pad.bankedTo() >= K1),
      counts: () => ({
        banked: bankedIn(wheel, wheelNeed()) + bankedIn(pad, padNeed),
        total: measured() ? wheelNeed() + padNeed : 0,
      }),
    };

    /* one clip at a time: the other is cut instantly, no overlap */
    const startWheel = () => {
      if (!wheel?.ready()) return;
      pad?.hideNow();
      fx.current?.setClipActive(true);
      wheel.playTo(wheel.last());
    };

    /* Sign up leaves on the landed wheel, not on a timer: its last frame is
       painted into the vault itself, so /signup opens with the turn finished
       and the clip canvas can be cleared without the still underneath changing. */
    const landWheel = () => {
      const url = wheelUrls[wheelUrls.length - 1];
      const hold = url ? fx.current?.holdFrame(url) : undefined;
      if (hold) void hold.then(onSignup);
      else onSignup();
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
      (WHEEL_FRAMES.length ? Promise.resolve(WHEEL_FRAMES) : discoverFrames(CLIPS.wheel.dir))
        .then((urls) => {
          wheelUrls = urls;
          return p.load(urls);
        })
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

    /* both clips stream while the entrance plays, so the intro that follows has
       nothing left to decode and the first hover already has its frames */
    if (wheel) later(() => whenIdle(requestWheel), 200);
    if (pad) later(() => whenIdle(requestPad), 618);

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
    /* Sign up leaves through the transition, not through the router */
    const departUp = () => later(onSignup, 1000);

    const clickUp = (e: MouseEvent) => {
      e.preventDefault();
      if (reducedMotion) return onSignup();
      if (wheel?.ready()) {
        const atEnd = wheel.index() >= wheel.last();
        startWheel();
        if (atEnd) {
          landWheel();
          return;
        }
        wheelNav = true;
        /* the clip reports its landing; this only catches a frame loop that
           never got there (a tab held in the background through the turn) */
        const turn = ((wheel.last() + 1) / CLIPS.wheel.fps) * 1000;
        later(() => {
          if (!wheelNav) return;
          wheelNav = false;
          landWheel();
        }, turn + 2618);
        return;
      }
      requestWheel();
      departUp();
    };

    const clickIn = (e: MouseEvent) => {
      e.preventDefault();
      if (reducedMotion) return goSignin();
      /* with the signin flow the clip stops at K1: keys lit and idle, which is
         the frame the form is unlocked over. The code entry from there belongs
         to /signin, not to the hero. */
      const target = FX.signinFlow ? K1 : pad?.last() ?? 0;
      if (pad?.ready()) {
        const atEnd = pad.index() >= target;
        startPad(target);
        if (atEnd) {
          goSignin();
          return;
        }
        padNav = true;
        /* the clip reports its own landing; this only catches a frame loop that
           never got there (a tab held in the background) */
        later(() => {
          if (!padNav) return;
          padNav = false;
          goSignin();
        }, 2618);
        return;
      }
      requestPad();
      if (FX.signinFlow) {
        goSignin();
        return;
      }
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

    /* ---------- first visit: the vault demos itself ---------- */
    /* Counts down only while the tab is on screen: a backgrounded or embedded
       tab, where the clips are paused too, cannot race past its own beats. */
    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        let left = ms;
        const step = () => {
          if (!document.hidden) left -= 100;
          if (left <= 0) res();
          else later(step, 100);
        };
        later(step, 100);
      });

    const clipsReady = () => (!pad || pad.ready()) && (!wheel || wheel.ready());

    /* hold a phase back until every frame it will draw is banked, so the sequence
       runs on decoded frames instead of holding on one still streaming. The cap
       is only there so a lost frame cannot strand the page. */
    const bank = async (player: ClipPlayer | null, frame: number) => {
      for (let left = 20_000; left > 0; left -= 100) {
        if (!player || player.bankedTo() >= frame) return;
        await sleep(100);
      }
    };

    /* Keypad first, then one wheel turn: the hover amounts only, never the click
       amount, and nothing here changes how the buttons react afterwards. */
    const runIntro = async () => {
      /* nothing demos itself behind the entry gate: the entrance only starts once
         the gate opens, so the beat is measured from the release, not the mount */
      while (!bootedRef.current) await sleep(100);
      /* the entrance has to land on screen before the demo starts over it */
      await sleep(INTRO_DELAY);
      /* the keypad decodes after the entrance: wait for it */
      while (!clipsReady()) await sleep(100);
      if (hoveringUp || hoveringIn) return;
      console.info("[fx] vault intro: keypad, then one wheel turn");

      /* the keys light up and run back down inside 0..K1, so that is all this
         phase needs banked before it starts */
      await bank(pad, K1);
      if (pad?.ready() && pad.index() < K1) {
        const arrived = new Promise<void>((res) => {
          padArrive = res;
        });
        startPad(K1);
        await Promise.race([arrived, sleep(4000)]);
        padArrive = null;
        await sleep(INTRO_HOLD);

        /* the keys go dark at their own pace before the wheel takes over */
        if (!hoveringUp && !hoveringIn) {
          const settled = new Promise<void>((res) => {
            padArrive = res;
          });
          pad.reverseTo(0);
          await Promise.race([settled, sleep(4000)]);
          padArrive = null;
        }
      }

      /* the pointer took over while the keys were lit: leave it alone */
      if (hoveringUp || hoveringIn) return;

      if (wheel?.ready()) {
        /* the wheel runs end to end, so it needs the whole clip banked */
        await bank(wheel, wheel.last());
        const arrived = new Promise<void>((res) => {
          wheelArrive = res;
        });
        startWheel();
        await Promise.race([arrived, sleep(9000)]);
        wheelArrive = null;
        /* back to closed, so the first real hover starts from the same frame */
        if (!hoveringUp && !hoveringIn) wheel.reverseTo(0);
      } else if (pad?.ready() && !hoveringIn) {
        /* no wheel clip to take over: dim the keys instead of leaving them lit */
        pad.reverseTo(0);
      }
    };

    if (reducedMotion) {
      console.info("[fx] vault intro: off — reduced motion is on");
    } else if (!wheel && !pad) {
      console.info("[fx] vault intro: off — no clip loaded");
    } else {
      void runIntro();
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      /* the vault outlives this route: anything the hero left lit (keys, glow,
         hinges, the hidden flat keypad) would still be on top of it */
      fx.current?.resetCtas();
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
      /* the gate keeps polling this ref: clearing it retires the measurement
         instead of leaving it pointing at disposed players */
      clips.current = null;
      wheel?.dispose();
      pad?.dispose();
    };
  }, [signupRef, signinRef, fx, clips, reducedMotion, onSignup, signinHref, navigate, startSignin]);

  return null;
}
