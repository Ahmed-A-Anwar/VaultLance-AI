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
    reduced,
    returning,
    startSignup,
  } = useVaultScene();

  const copyRef = useRef<HTMLDivElement | null>(null);
  const eyebrowRef = useRef<HTMLParagraphElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  const ctaBlockRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<HTMLDivElement | null>(null);
  const microRef = useRef<HTMLParagraphElement | null>(null);
  const chipsRef = useRef<HTMLUListElement | null>(null);

  /* the way back: the copy is set to its exit pose before paint, then returns on
     the same beat the vault slides home */
  useLayoutEffect(() => {
    if (!ready || !returning) return;
    const items = [
      eyebrowRef.current,
      headlineRef.current,
      ctaBlockRef.current,
      microRef.current,
      bodyRef.current,
      chipsRef.current,
    ].filter(Boolean) as HTMLElement[];
    gsap.set(items, { x: -89, opacity: 0 });
    const tween = gsap.to(items, {
      x: 0,
      opacity: 1,
      duration: 0.618,
      stagger: 0.0618,
      ease: "power3.out",
      delay: 0.382,
    });
    return () => {
      tween.kill();
    };
  }, [ready, returning]);

  useEffect(() => {
    if (!ready || returning) return;
    const timeline = createHeroTimeline({
      reducedMotion: reduced,
      parallax: !reduced && window.innerWidth >= 1024,
      targets: {
        page: pageRef.current,
        copy: copyRef.current,
        stage: stageWrapRef.current,
        rim: rimRef.current,
        eyebrow: eyebrowRef.current,
        headline: headlineRef.current,
        body: bodyRef.current,
        ctaBlock: ctaBlockRef.current,
        buttons: buttonsRef.current,
        micro: microRef.current,
        chips: chipsRef.current,
        keypadGlow: glowRef.current,
      },
    });
    timeline.play();
    return () => timeline.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, reduced, returning]);

  return (
    <>
      <main id="main" className="hero-layout">
        <HeroCopy
          ref={copyRef}
          headline="Pay for work you've actually tested."
          signupHref="/signup"
          signinHref={SIGNIN_HREF}
          eyebrowRef={eyebrowRef}
          headlineRef={headlineRef}
          bodyRef={bodyRef}
          ctaBlockRef={ctaBlockRef}
          buttonsRef={buttonsRef}
          microRef={microRef}
          chipsRef={chipsRef}
          signupRef={signupRef}
          signinRef={signinRef}
        />
      </main>

      <HeroButtons
        signupRef={signupRef}
        signinRef={signinRef}
        fx={fx}
        reducedMotion={reduced}
        onSignup={startSignup}
        signinHref={SIGNIN_HREF}
      />
    </>
  );
}

export default Hero;
