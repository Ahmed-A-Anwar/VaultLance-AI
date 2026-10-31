/* HeroCopy.tsx — split headline, body and CTAs. Copy is spec-exact. The
   headline is one h1: the split spans are aria-hidden and the full sentence
   lives in a visually hidden span.

   DOM order is buttons, body; CSS `order` puts them in reading order on desktop
   (body before the buttons) and on mobile (buttons before the body). */

import { forwardRef } from "react";
import type { RefObject } from "react";

export interface HeroCopyProps {
  headline: string;
  signupHref: string;
  signinHref: string;
  headlineRef: RefObject<HTMLHeadingElement | null>;
  bodyRef: RefObject<HTMLParagraphElement | null>;
  ctaBlockRef: RefObject<HTMLDivElement | null>;
  buttonsRef: RefObject<HTMLDivElement | null>;
  signupRef: RefObject<HTMLAnchorElement | null>;
  signinRef: RefObject<HTMLAnchorElement | null>;
}

export const HeroCopy = forwardRef<HTMLDivElement, HeroCopyProps>(function HeroCopy(
  {
    headline,
    signupHref,
    signinHref,
    headlineRef,
    bodyRef,
    ctaBlockRef,
    buttonsRef,
    signupRef,
    signinRef,
  },
  ref
) {
  const words = headline.split(/\s+/);

  return (
    <div className="hero-copy" ref={ref}>
      <h1 className="hero-h1" ref={headlineRef}>
        <span className="sr-only">Pay for work you&rsquo;ve actually tested.</span>
        {words.map((word, i) => (
          <span className="word" key={i} aria-hidden="true">
            <span className="word-inner">{word}</span>
          </span>
        ))}
      </h1>

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
      </div>

      <p className="hero-body" ref={bodyRef}>
        {"VaultLance AI is an escrow agent that securely hosts freelance digital deliverables from web apps to brand design assets, allowing clients to interrogate the work through live staging tests and visual AI analysis, giving them the confidence to authorize the PayPal payment that instantly unlocks their files."}
      </p>
    </div>
  );
});
