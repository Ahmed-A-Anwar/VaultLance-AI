/* hero-timeline.ts — entrance timeline, idle loops, pointer parallax and the
   scroll handoff for the VaultPay AI hero. Timings come from the spec only. */

import gsap from "gsap";

export interface HeroTimelineTargets {
  page: HTMLElement | null;
  copy: HTMLElement | null;
  stage: HTMLElement | null;
  rim: HTMLElement | null;
  eyebrow: HTMLElement | null;
  headline: HTMLElement | null;
  body: HTMLElement | null;
  ctaBlock: HTMLElement | null;
  buttons: HTMLElement | null;
  micro: HTMLElement | null;
  chips: HTMLElement | null;
  keypadGlow: HTMLElement | null;
}

export interface HeroTimelineOptions {
  targets: HeroTimelineTargets;
  reducedMotion: boolean;
  parallax: boolean;
}

export interface HeroTimeline {
  play: () => void;
  destroy: () => void;
}

export function createHeroTimeline({ targets, reducedMotion, parallax }: HeroTimelineOptions): HeroTimeline {
  const { page, copy, stage, rim, eyebrow, headline, body, buttons, micro, chips, keypadGlow } = targets;
  let intro: gsap.core.Timeline | null = null;
  let idle: gsap.core.Timeline | null = null;
  let raf = 0;
  let headRaf = 0;

  const finalState = () => {
    gsap.set([page, stage, eyebrow, body, buttons, micro, chips].filter(Boolean), { clearProps: "all" });
    gsap.set([stage, eyebrow, body, buttons, micro, chips].filter(Boolean), { opacity: 1, x: 0, y: 0, scale: 1 });
    if (headline) {
      gsap.set(headline.querySelectorAll(".word-inner"), { opacity: 1, yPercent: 0, clearProps: "transform" });
    }
  };

  const startIntro = () => {
    if (page) gsap.set(page, { opacity: 0 });
    if (stage) gsap.set(stage, { y: 34, opacity: 0, scale: 0.97 });
    if (rim) gsap.set(rim, { opacity: 0 });
    if (eyebrow) gsap.set(eyebrow, { y: 13, opacity: 0 });
    if (body) gsap.set(body, { y: 21, opacity: 0 });
    if (micro) gsap.set(micro, { opacity: 0 });
    if (chips) gsap.set(chips, { opacity: 0 });
    if (headline) gsap.set(headline.querySelectorAll(".word-inner"), { yPercent: 100, opacity: 0 });
    if (buttons) gsap.set(buttons.querySelectorAll(".hero-btn"), { y: 21, opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    if (page) tl.to(page, { opacity: 1, duration: 0.618 }, 0);
    tl.to(stage, { y: 0, opacity: 1, scale: 1, duration: 1.618, ease: "expo.out" }, 0);
    tl.to(rim, { opacity: 1, duration: 0.618, ease: "power2.out" }, 0.236);
    tl.to(eyebrow, { y: 0, opacity: 1, duration: 0.382 }, 0.382);
    if (headline) {
      tl.to(headline.querySelectorAll(".word-inner"), {
        yPercent: 0,
        opacity: 1,
        duration: 0.618,
        stagger: 0.0618,
      }, 0.618);
    }
    tl.to(body, { y: 0, opacity: 1, duration: 0.618 }, 1.0);
    if (buttons) {
      tl.to(buttons.querySelectorAll(".hero-btn"), {
        y: 0,
        opacity: 1,
        duration: 0.618,
        stagger: 0.236,
      }, 1.382);
    }
    tl.to([micro, chips].filter(Boolean), { opacity: 1, duration: 0.618, stagger: 0.1 }, 1.618);
    tl.call(startIdle, undefined, 2.618);
    intro = tl;
  };

  const startIdle = () => {
    const loops = gsap.timeline({ repeat: -1 });
    if (stage) {
      // float ±8px over a 6.18s sine period
      loops.fromTo(stage, { y: -8 }, { y: 8, duration: 3.09, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
    }
    if (keypadGlow) {
      loops.fromTo(keypadGlow, { opacity: 0.2 }, { opacity: 0.6, duration: 1.309, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
    }
    idle = loops;
  };

  const onVisibility = () => {
    if (document.hidden) {
      intro?.pause();
      idle?.pause();
      if (raf) cancelAnimationFrame(raf);
      if (headRaf) cancelAnimationFrame(headRaf);
    } else {
      intro?.resume();
      idle?.resume();
      if (parallax) attachParallax();
    }
  };

  let detach: (() => void) | null = null;

  function attachParallax() {
    detach?.();
    // parallax acts on the inner stage so the idle float (outer wrapper) survives
    const el = stage?.querySelector<HTMLElement>(".hero-stage") ?? null;
    if (!el || !parallax || reducedMotion) return;
    const state = { rx: 0, ry: 0, nx: 0, ny: 0 };
    if (copy) gsap.set(copy, { transformPerspective: 900 });

    const onMove = (e: PointerEvent) => {
      state.nx = (e.clientX / window.innerWidth) * 2 - 1;
      state.ny = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const tick = () => {
      state.rx += (state.nx * 3.82 - state.rx) * 0.08;
      state.ry += (-state.ny * 3.82 - state.ry) * 0.08;
      el.style.transform = `perspective(1400px) rotateY(${state.rx.toFixed(2)}deg) rotateX(${state.ry.toFixed(2)}deg)`;
      if (copy) {
        copy.style.setProperty("--hero-par-x", `${(-state.nx * 8).toFixed(2)}px`);
        copy.style.setProperty("--hero-par-y", `${(state.ny * 8).toFixed(2)}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    detach = () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = "";
      copy?.style.removeProperty("--hero-par-x");
      copy?.style.removeProperty("--hero-par-y");
    };
  }

  let parallaxOn = false;
  const onScroll = () => {
    if (!copy) return;
    const span = Math.max(1, window.innerHeight * 0.06);
    const p = Math.min(1, window.scrollY / span);
    copy.style.opacity = String(1 - p);
    copy.style.transform = `translate3d(var(--hero-par-x, 0px), calc(var(--hero-par-y, 0px) - ${(21 * p).toFixed(2)}px), 0)`;
    copy.style.pointerEvents = p > 0.98 ? "none" : "";
    /* unpin pointer parallax while the hero is scrolling away, re-arm at the top */
    if (p > 0.06 && parallaxOn) {
      detach?.();
      detach = null;
      parallaxOn = false;
    } else if (p <= 0.001 && !parallaxOn && parallax) {
      attachParallax();
      parallaxOn = true;
    }
  };

  const play = () => {
    if (reducedMotion) {
      finalState();
      document.addEventListener("visibilitychange", onVisibility);
      return;
    }
    startIntro();
    if (parallax) {
      attachParallax();
      parallaxOn = true;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
  };

  const destroy = () => {
    intro?.kill();
    idle?.kill();
    detach?.();
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    if (raf) cancelAnimationFrame(raf);
    if (headRaf) cancelAnimationFrame(headRaf);
  };

  return { play, destroy };
}

export default createHeroTimeline;
