/* Hero.tsx — landing top: vault stage behind the copy column. */

import { useCallback, useEffect, useRef, useState } from "react";
import { HeroCopy } from "./HeroCopy";
import { HeroVault, type VaultFx } from "./HeroVault";
import HeroButtons from "./HeroButtons";
import { createHeroTimeline } from "./hero-timeline";

const FRAME_1 = "/vault-frames/f_001.webp";
const SIGNUP_HREF = "/signup";
const SIGNIN_HREF = "/signin";

export function Hero() {
  const pageRef = useRef<HTMLElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rimRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const eyebrowRef = useRef<HTMLParagraphElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  const ctaBlockRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<HTMLDivElement | null>(null);
  const microRef = useRef<HTMLParagraphElement | null>(null);
  const chipsRef = useRef<HTMLUListElement | null>(null);
  const signupRef = useRef<HTMLAnchorElement | null>(null);
  const signinRef = useRef<HTMLAnchorElement | null>(null);
  const fx = useRef<VaultFx | null>(null);

  const [mounted, setMounted] = useState(false);
  const reduced = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [ready, setReady] = useState(false);

  useEffect(() => setMounted(true), []);
  const onVaultReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (!mounted || !ready) return;
    const timeline = createHeroTimeline({
      reducedMotion: reduced,
      parallax: window.innerWidth >= 1024,
      targets: {
        page: pageRef.current,
        copy: copyRef.current,
        stage: stageRef.current,
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
  }, [mounted, ready, reduced]);

  return (
    <section className="hero-page" ref={pageRef} data-testid="hero">
      <div className="hero-shell">
        <div className="hero-stage-wrap" ref={stageRef}>
          <HeroVault
            ref={fx}
            frameSrc={FRAME_1}
            rimRef={rimRef}
            glowRef={glowRef}
            signinAnchorRef={signinRef}
            onReady={onVaultReady}
          />
        </div>

        <div className="hero-layout">
          <HeroCopy
            ref={copyRef}
            headline="Pay for work you've actually tested."
            signupHref={SIGNUP_HREF}
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
        </div>
      </div>

      <HeroButtons
        signupRef={signupRef}
        signinRef={signinRef}
        fx={fx}
        reducedMotion={reduced}
        signupHref={SIGNUP_HREF}
        signinHref={SIGNIN_HREF}
      />
    </section>
  );
}

export default Hero;
