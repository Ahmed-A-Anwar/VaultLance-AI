/// <reference types="vite/client" />
/* ForgotPassword.tsx — "/forgot-password": ask for the email, then say a link is
   on its way. Mock only: nothing is sent, and no answer ever says whether an
   address has an account.

   The vault is mounted by VaultLayout and stays put; this file owns the card in
   the left column, its states, and the answers it asks of the vault. The rules
   live in lib/mockAuth. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import gsap from "gsap";
import { useVaultScene } from "../../lib/vaultScene";
import { FX } from "../../config/fx";
import {
  MAX_RESET_SENDS,
  MOCK_RESET_LINK,
  RESEND_SECONDS,
  RESET_LINK_MINUTES,
  RESET_SEND_ERROR,
  RESET_TOO_MANY,
  noteResetSend,
  requestReset,
  resetEmailError,
  resetSendCount,
} from "../../lib/mockAuth";
import { AuthBrand } from "../../components/auth/AuthBrand";
import { AuthField } from "../../components/auth/AuthField";
import { StatusLine } from "../../components/auth/StatusLine";
import { PadFlash, type PadFlashHandle } from "../../components/auth/PadFlash";
import { ToastProvider } from "../../components/shared/Toasts";
import "../../styles/signin.css";
import "../../styles/shared.css";
import "./auth.css";

/* the button's own beat, as on /signin */
const SPIN = 618;
/* the card's content swap */
const SWAP = 0.382;

const ARROW_LEFT = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 5l-7 7 7 7" />
  </svg>
);

const ARROW_RIGHT = (
  <svg className="hero-btn-icon auth-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12h15M13 5l7 7-7 7" />
  </svg>
);

const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms));

/* the sandbox fails a slice of its submissions, so the failure path stays
   reachable; FX.mockErrors false makes every submission succeed */
const mockFails = () => FX.mockErrors && Math.random() < 0.05;

export default function ForgotPassword() {
  return (
    <ToastProvider>
      <RequestScreen />
    </ToastProvider>
  );
}

function RequestScreen() {
  const { reduced } = useVaultScene();
  const location = useLocation();

  /* the address typed on /signin rides the navigation, when there was one */
  const carried = (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(carried);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [live, setLive] = useState("");

  const swapIn = useRef(false);
  const swapRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<PadFlashHandle | null>(null);
  const emailInput = useRef<HTMLInputElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const lastCooldown = useRef(0);

  /* the entrance: VaultLayout brings the card itself in, the children rise behind
     it. A direct load has no entrance to join. */
  useLayoutEffect(() => {
    if (reduced || location.key === "default") return;
    const kids = Array.from(document.querySelectorAll<HTMLElement>(".auth-card [data-reveal]"));
    if (!kids.length) return;
    const tl = gsap.fromTo(
      kids,
      { y: 21, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.618, stagger: 0.1, delay: 0.236, ease: "power3.out" }
    );
    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  /* the content swap, the incoming half arriving from x -21 */
  useLayoutEffect(() => {
    if (!swapIn.current) return;
    swapIn.current = false;
    const el = swapRef.current;
    if (!el || reduced) return;
    gsap.fromTo(el, { x: -21, opacity: 0 }, { x: 0, opacity: 1, duration: SWAP, ease: "power2.out" });
  }, [sent, reduced]);

  useEffect(() => {
    if (sent) heading.current?.focus();
  }, [sent]);

  /* the cooldown ticks once a second and is announced only at its two ends */
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((left) => (left <= 1 ? 0 : left - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    if (cooldown === lastCooldown.current) return;
    if (cooldown === 0) setLive("You can send another link now.");
    else if (lastCooldown.current === 0) setLive(`You can try again in ${cooldown} seconds.`);
    lastCooldown.current = cooldown;
  }, [cooldown]);

  const swapTo = (next: boolean) => {
    const el = swapRef.current;
    if (!el || reduced) {
      setSent(next);
      return;
    }
    gsap.to(el, {
      opacity: 0,
      duration: SWAP,
      ease: "power2.out",
      onComplete: () => {
        swapIn.current = true;
        setSent(next);
      },
    });
  };

  /* the vault's answer: the keypad flashes teal twice on the way to "sent" */
  const announceSent = () => {
    flashRef.current?.flash("teal", 2);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    const next = resetEmailError(email);
    setError(next);
    setFailure(null);
    if (next) {
      emailInput.current?.focus();
      return;
    }

    /* three requests is this tab's worth */
    if (resetSendCount() >= MAX_RESET_SENDS) {
      setCooldown(RESEND_SECONDS);
      setFailure(RESET_TOO_MANY);
      return;
    }

    setSending(true);
    const started = performance.now();
    const result = requestReset(email);
    const failed = !result.ok || mockFails();
    await wait(Math.max(0, SPIN - (performance.now() - started)));
    setSending(false);

    if (failed) {
      setFailure(result.ok ? RESET_SEND_ERROR : result.error);
      return;
    }

    noteResetSend();
    setLive(`Reset link sent to ${email.trim()}.`);
    announceSent();
    swapTo(true);
  };

  const swapToForm = () => {
    if (sending) return;
    setError(null);
    setFailure(null);
    swapTo(false);
    window.requestAnimationFrame(() => emailInput.current?.focus());
  };

  return (
    <main id="main" className="signin-layout auth-layout">
      <AuthBrand to="/signin" />

      <div className="signin-rail">
        <StatusLine text="KEYPAD LOCKED" />
      </div>

      <div className="signin-card auth-card" data-testid="forgot-card">
        <div className="signin-head">
          {/* under 1100px the strip is gone and the same line sits above the H1 */}
          <StatusLine text="KEYPAD LOCKED" inline />
          <h1 className="signin-h1" data-reveal tabIndex={-1} ref={heading} data-testid="forgot-h1">
            Forgot your code?
          </h1>
          <p className="signin-sub" data-reveal>
            Enter your email. We&rsquo;ll send a link to reset your password.
          </p>
        </div>

        <div className="auth-swap" ref={swapRef}>
          {sent ? (
            <div className="auth-body" data-testid="forgot-sent">
              <p className="auth-mono">{`CHECK SPAM · LINK EXPIRES IN ${RESET_LINK_MINUTES} MINUTES`}</p>
              <Link className="hero-btn primary signin-submit" to="/signin" data-testid="sent-back">
                <span className="hero-btn-label">Back to sign in</span>
                {ARROW_RIGHT}
                <span className="hero-shimmer" aria-hidden="true" />
              </Link>
              <button type="button" className="auth-ghost" onClick={swapToForm} data-testid="sent-different">
                {ARROW_LEFT}
                Use a different email
              </button>
            </div>
          ) : (
            <form className="signin-form" onSubmit={submit} noValidate>
              <AuthField
                ref={emailInput}
                id="forgot-email"
                label="Email"
                type="email"
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                  if (failure) setFailure(null);
                }}
                onBlur={() => setError(resetEmailError(email))}
                error={error}
                alert={!!failure}
                autoComplete="email"
                inputMode="email"
              />

              {failure && (
                <p className="signin-err" role="alert" data-testid="forgot-failure">
                  {failure}
                </p>
              )}

              <button
                className="hero-btn primary signin-submit"
                type="submit"
                data-reveal
                data-testid="forgot-submit"
                disabled={sending || cooldown > 0}
                aria-busy={sending || undefined}
              >
                {sending && <span className="signin-spin" aria-hidden="true" />}
                <span className="hero-btn-label">Send reset link</span>
                {ARROW_RIGHT}
                <span className="hero-shimmer" aria-hidden="true" />
              </button>

              {cooldown > 0 && (
                <p className="auth-count" data-testid="forgot-count">{`TRY AGAIN IN ${cooldown}S`}</p>
              )}

              <p className="auth-mono" data-reveal>
                SANDBOX DEMO · NO REAL EMAIL IS SENT.
              </p>
            </form>
          )}
        </div>

        {/* dev builds only: the link the email would have carried. It sits inside
            the card's glass so the deck's column never shifts for it. */}
        {import.meta.env.DEV && (
          <div className="auth-dev">
            <span className="auth-dev-label">DEV ONLY</span>
            <Link className="auth-dev-link" to={MOCK_RESET_LINK} data-testid="dev-reset-link">
              OPEN MOCK RESET LINK
            </Link>
          </div>
        )}
      </div>

      <PadFlash ref={flashRef} reduced={reduced} />

      <p className="sr-only" aria-live="polite" data-testid="auth-live">
        {live}
      </p>
    </main>
  );
}
