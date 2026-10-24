/* HeroCopy.tsx — eyebrow, split headline, body, CTAs, micro-note and chips.
   Copy is spec-exact. The headline is one h1: the split spans are aria-hidden
   and the full sentence lives in a visually hidden span. */

import { forwardRef } from "react";
import type { RefObject } from "react";

export interface HeroCopyProps {
  headline: string;
  signupHref: string;
  signinHref: string;
  eyebrowRef: RefObject<HTMLParagraphElement | null>;
  headlineRef: RefObject<HTMLHeadingElement | null>;
  bodyRef: RefObject<HTMLParagraphElement | null>;
  ctaBlockRef: RefObject<HTMLDivElement | null>;
  buttonsRef: RefObject<HTMLDivElement | null>;
  microRef: RefObject<HTMLParagraphElement | null>;
  chipsRef: RefObject<HTMLUListElement | null>;
  signupRef: RefObject<HTMLAnchorElement | null>;
  signinRef: RefObject<HTMLAnchorElement | null>;
}

export const HeroCopy = forwardRef<HTMLDivElement, HeroCopyProps>(function HeroCopy(
  {
    headline,
    signupHref,
    signinHref,
    eyebrowRef,
    headlineRef,
    bodyRef,
    ctaBlockRef,
    buttonsRef,
    microRef,
    chipsRef,
    signupRef,
    signinRef,
  },
  ref
) {
  const words = headline.split(/\s+/);

  return (
    <div className="hero-copy" ref={ref}>
      <p className="hero-eyebrow" ref={eyebrowRef}>
        AI-AUDITED ESCROW FOR DIGITAL WORK
      </p>

      <h1 className="hero-h1" ref={headlineRef}>
        <span className="sr-only">Pay for work you&rsquo;ve actually tested.</span>
        {words.map((word, i) => (
          <span className="word" key={i} aria-hidden="true">
            <span className="word-inner">{word}</span>
          </span>
        ))}
      </h1>

      <p className="hero-body" ref={bodyRef}>
        VaultPay AI holds the deliverables and your payment side by side. Ask the AI
        anything about the work. It runs real checks, not guesses. Approve, and PayPal
        releases the funds and unlocks the files.
      </p>

      <div className="hero-cta-block" ref={ctaBlockRef}>
        <div className="hero-cta-row" ref={buttonsRef}>
          <a
            className="hero-btn primary"
            href={signupHref}
            ref={signupRef}
            data-testid="hero-signup"
          >
            <span className="hero-btn-label">Sign up</span>
            <svg className="hero-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12h15M13 5l7 7-7 7" />
            </svg>
            <span className="hero-shimmer" aria-hidden="true" />
          </a>

          <a
            className="hero-btn glass"
            href={signinHref}
            ref={signinRef}
            data-testid="hero-signin"
          >
            <svg className="hero-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="9" rx="2" />
              <path d="M7 11V7.5a5 5 0 0 1 9.5-2" />
              <path d="M12 15v2" />
            </svg>
            <span className="hero-btn-label">Sign in</span>
          </a>
        </div>

        <p className="hero-micro" ref={microRef}>
          SANDBOX DEMO · NO REAL MONEY
        </p>

        <ul className="hero-chips" ref={chipsRef}>
          <li className="hero-chip">FUNDS HELD, NOT SPENT</li>
          <li className="hero-chip">REAL CHECKS, NOT CLAIMS</li>
          <li className="hero-chip">FILES UNLOCK ON CAPTURE</li>
        </ul>
      </div>
    </div>
  );
});
