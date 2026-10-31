/* Hero.tsx — the landing content inside the persistent vault layout: the copy
   column, the entrance timeline and the CTA wiring. The vault itself lives in
   VaultLayout and is never remounted by a route change. Coming back from
   /signup, the copy returns instead of replaying the intro. */

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { HeroCopy } from "./HeroCopy";
import HeroButtons from "./HeroButtons";
import { createHeroTimeline } from "./hero-timeline";
import { useVaultScene } from "../lib/vaultScene";

const SIGNIN_HREF = "/signin";

export function Hero() {
  const {
    fx,
    pageRef,
    stageWrapRef,
    rimRef,
    glowRef,
    signupRef,
    signinRef,
    ready,
    booted,
    clips,
    reduced,
    returning,
    startSignup,
  } = useVaultScene();

  const copyRef = useRef<HTMLDivElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  const ctaBlockRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<HTMLDivElement | null>(null);

  /* the way back: the copy is set to its exit pose before paint, then returns on
     the same beat the vault slides home */
  useLayoutEffect(() => {
    if (!ready || !returning) return;
    const items = [
      headlineRef.current,
      ctaBlockRef.current,
      bodyRef.current,
    ].filter(Boolean) as HTMLElement[];
    // phones return from below, desktop from the left (the same axis as the exit)
    const vertical = window.innerWidth < 768;
    gsap.set(items, vertical ? { y: 89, x: 0, opacity: 0 } : { x: -89, y: 0, opacity: 0 });

    let tween: gsap.core.Tween | null = null;
    const id = window.setTimeout(() => {
      tween = gsap.to(items, {
        ...(vertical ? { y: 0 } : { x: 0 }),
        opacity: 1,
        duration: 0.618,
        stagger: 0.0618,
        ease: "power3.out",
      });
    }, 382);

    /* the copy never stays in its exit pose: if this effect is torn down before
       the reveal has landed (StrictMode's double mount, or the route changing
       again), put it back at rest. A killed tween would otherwise freeze the
       headline and the CTAs at opacity 0, which reads as the buttons vanishing. */
    return () => {
      window.clearTimeout(id);
      tween?.kill();
      gsap.set(items, { x: 0, y: 0, opacity: 1, clearProps: "transform" });
    };
  }, [ready, returning]);

  /* the entrance waits for the entry gate: the vault has painted, and both CTA
     clips are banked. Running it under the curtain is what the gate is for. */
  useEffect(() => {
    if (!ready || returning || !booted) return;
    const timeline = createHeroTimeline({
      reducedMotion: reduced,
      parallax: !reduced && window.innerWidth >= 1024,
      targets: {
        page: pageRef.current,
        copy: copyRef.current,
        stage: stageWrapRef.current,
        rim: rimRef.current,
        headline: headlineRef.current,
        body: bodyRef.current,
        ctaBlock: ctaBlockRef.current,
        buttons: buttonsRef.current,
        keypadGlow: glowRef.current,
      },
    });
    timeline.play();
    return () => timeline.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, booted, reduced, returning]);

  return (
    <>
      <main id="main" className="hero-layout">
        <HeroCopy
          ref={copyRef}
          headline="Pay for work you've actually tested."
          signupHref="/signup"
          signinHref={SIGNIN_HREF}
          headlineRef={headlineRef}
          bodyRef={bodyRef}
          ctaBlockRef={ctaBlockRef}
          buttonsRef={buttonsRef}
          signupRef={signupRef}
          signinRef={signinRef}
        />
      </main>

      <HeroButtons
        signupRef={signupRef}
        signinRef={signinRef}
        fx={fx}
        clips={clips}
        booted={booted}
        reducedMotion={reduced}
        onSignup={startSignup}
        signinHref={SIGNIN_HREF}
      />
    </>
  );
}

export default Hero;
