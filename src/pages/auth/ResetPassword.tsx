/// <reference types="vite/client" />
/* ResetPassword.tsx — "/reset-password?token=…": the new code, the dead ends, and
   the way back to /signin.

   Mock only. The token rules live in lib/mockAuth (demo-valid, demo-expired,
   everything else invalid), the strength rules in components/auth/StrengthMeter,
   and the vault's answers — the code-entry clip, the green LED, the red flash —
   are asked of VaultLayout through the scene, never implemented here. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { useVaultScene } from "../../lib/vaultScene";
import { FX } from "../../config/fx";
import { RESET_MISMATCH, resetPassword, verifyResetToken } from "../../lib/mockAuth";
import { AuthBrand } from "../../components/auth/AuthBrand";
import { AuthField } from "../../components/auth/AuthField";
import { StatusLine } from "../../components/auth/StatusLine";
import { PadFlash, type PadFlashHandle } from "../../components/auth/PadFlash";
import { RequirementList, StrengthMeter, strengthOf } from "../../components/auth/StrengthMeter";
import "../../styles/signin.css";
import "./auth.css";

const SPIN = 618;
const SWAP = 0.382;
/* how long the strip holds a refusal */
const REJECT_HOLD = 1618;
/* the auto-redirect's beat */
const REDIRECT = 2618;

const ARROW_RIGHT = (
  <svg className="hero-btn-icon auth-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12h15M13 5l7 7-7 7" />
  </svg>
);

const SHIELD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.75l7.25 3v6.5c0 4.25-3 7.5-7.25 9-4.25-1.5-7.25-4.75-7.25-9v-6.5z" />
    <path className="auth-draw" d="M8.75 12.25l2.5 2.5 4.5-5" />
  </svg>
);

const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms));

/* the sandbox fails a slice of its submissions, so the failure path stays
   reachable; FX.mockErrors false makes every submission succeed */
const mockFails = () => FX.mockErrors && Math.random() < 0.05;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const state = verifyResetToken(token);

  return (
    <main id="main" className="signin-layout auth-layout">
      <ResetScreen token={token} state={state} />
    </main>
  );
}

type TokenState = ReturnType<typeof verifyResetToken>;

function ResetScreen({ token, state }: { token: string | null; state: TokenState }) {
  const { reduced, padEnter, padFail } = useVaultScene();
  const navigate = useNavigate();
  const location = useLocation();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [live, setLive] = useState("");
  const [cancelled, setCancelled] = useState(false);

  const swapRef = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const flashRef = useRef<PadFlashHandle | null>(null);
  const confirmRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const strength = strengthOf(password);
  const canSubmit = strength.level >= 2 && confirm.length > 0 && confirm === password;

  /* the dead ends and the refusals both ask the keypad to say so, once */
  useEffect(() => {
    if (state === "valid") return;
    flashRef.current?.flash("red", 1);
  }, [state, reduced]);

  /* the entrance: VaultLayout owns the card, the children rise behind it */
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

  /* the strength is announced once the typing stops, not on every keystroke */
  useEffect(() => {
    if (state !== "valid" || done) return;
    if (!password) return;
    const id = window.setTimeout(() => setLive(`Password strength: ${strength.label}.`), 618);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strength.level, password.length > 0, state, done]);

  useEffect(() => {
    if (done) heading.current?.focus();
  }, [done]);

  useEffect(() => {
    if (!rejecting) return;
    const id = window.setTimeout(() => setRejecting(false), REJECT_HOLD);
    return () => window.clearTimeout(id);
  }, [rejecting]);

  /* the auto-redirect: any key or press calls it off, and so does leaving */
  useEffect(() => {
    if (!done || cancelled) return;
    const id = window.setTimeout(() => navigate("/signin"), REDIRECT);
    const stop = () => {
      window.clearTimeout(id);
      setCancelled(true);
    };
    window.addEventListener("keydown", stop);
    window.addEventListener("pointerdown", stop);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("pointerdown", stop);
    };
  }, [done, cancelled, navigate]);

  const swapTo = (next: boolean) => {
    const el = swapRef.current;
    if (!el || reduced) {
      setDone(next);
      return;
    }
    gsap.to(el, { opacity: 0, duration: SWAP, ease: "power2.out" });
    window.setTimeout(() => setDone(next), SWAP * 1000);
  };

  const shake = () => {
    const card = document.querySelector<HTMLElement>(".auth-card");
    if (!card || reduced) return;
    gsap.killTweensOf(card);
    gsap.to(card, {
      keyframes: [{ x: -8 }, { x: 8 }, { x: -4 }, { x: 0 }],
      duration: 0.382,
      ease: "power2.out",
      onComplete: () => gsap.set(card, { clearProps: "transform" }),
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!password) {
      setFieldError(null);
      setFailure("Enter a new password.");
      passwordRef.current?.focus();
      return;
    }
    if (strength.level < 2) {
      setFailure("Choose a stronger password first.");
      passwordRef.current?.focus();
      return;
    }
    if (confirm !== password) {
      setFieldError(RESET_MISMATCH);
      setFailure(null);
      confirmRef.current?.focus();
      return;
    }

    setFieldError(null);
    setFailure(null);
    setSubmitting(true);
    const started = performance.now();
    const result = resetPassword(token, password);
    const failed = !result.ok || mockFails();
    await wait(Math.max(0, SPIN - (performance.now() - started)));
    setSubmitting(false);

    if (failed) {
      setFailure(result.ok ? "Couldn't save the new password. Try again." : result.error);
      setRejecting(true);
      flashRef.current?.flash("red", 1);
      shake();
      return;
    }

    /* the vault answers: the code entry runs on the clip, or the LED lights
       when there is no clip to run */
    if (!reduced && FX.keypadClip && !padFail) void padEnter();
    else flashRef.current?.led();
    setLive("Your password was updated.");
    swapTo(true);
  };

  const status =
    done
      ? { text: "CODE UPDATED", tone: "success" as const, pulse: false }
      : state !== "valid"
        ? { text: "LINK EXPIRED", tone: "danger" as const, pulse: false }
        : rejecting
          ? { text: "CODE REJECTED", tone: "danger" as const, pulse: false }
          : { text: "NEW CODE", tone: "steel" as const, pulse: false };

  return (
    <>
      <AuthBrand to="/signin" />

      <div className="signin-rail">
        <StatusLine text={status.text} tone={status.tone} pulse={status.pulse} />
      </div>

      <div className="signin-card auth-card" data-testid="reset-card">
        <div className="auth-swap" ref={swapRef}>
          {state !== "valid" ? (
            <div data-testid={`reset-${state}`}>
              <div className="signin-head">
                <StatusLine text={status.text} tone={status.tone} inline />
                <h1 className="signin-h1" data-reveal tabIndex={-1} ref={heading} data-testid="reset-h1">
                  {state === "expired" ? "This link has expired." : "This link isn\u2019t valid."}
                </h1>
                <p className="signin-sub" data-reveal>
                  Request a new reset link to continue.
                </p>
              </div>
              <div className="auth-actions" style={{ marginTop: 21 }}>
                <Link className="hero-btn primary signin-submit" to="/forgot-password" data-testid="reset-request">
                  <span className="hero-btn-label">Request a new link</span>
                  {ARROW_RIGHT}
                  <span className="hero-shimmer" aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : done ? (
            <div data-testid="reset-success">
              <div className="signin-head">
                <StatusLine text={status.text} tone={status.tone} inline />
                <div className="auth-icon" data-tone="success" aria-hidden="true">
                  {SHIELD}
                </div>
                <h1 className="signin-h1" tabIndex={-1} ref={heading} data-testid="reset-h1">
                  Vault re-secured.
                </h1>
                <p className="signin-sub">
                  Your password was updated. Sign in with your new password.
                </p>
              </div>
              <div className="auth-actions" style={{ marginTop: 21 }}>
                <div>
                  <Link className="hero-btn primary signin-submit" to="/signin" data-testid="reset-signin">
                    <span className="hero-btn-label">Sign in</span>
                    {ARROW_RIGHT}
                    <span className="hero-shimmer" aria-hidden="true" />
                  </Link>
                  {!cancelled && !reduced && (
                    <div className="auth-drain" data-tone="brass" style={{ "--auth-drain": "2.618s" } as React.CSSProperties} aria-hidden="true" />
                  )}
                </div>
                {cancelled && (
                  <p className="auth-mono" data-testid="reset-redirect-cancelled">
                    SIGN IN WHEN YOU ARE READY
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="signin-head">
                <StatusLine text={status.text} tone={status.tone} inline />
                <h1 className="signin-h1" data-reveal tabIndex={-1} ref={heading} data-testid="reset-h1">
                  Set a new code.
                </h1>
                <p className="signin-sub" data-reveal>
                  Choose a strong password for your vault.
                </p>
              </div>

              <form className="signin-form" onSubmit={submit} noValidate>
                <div>
                  <AuthField
                    ref={passwordRef}
                    id="reset-password"
                    label="New password"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      if (fieldError) setFieldError(null);
                      if (failure) setFailure(null);
                    }}
                    onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
                    autoComplete="new-password"
                    trailing={
                      <button
                        type="button"
                        className="signin-eye"
                        aria-pressed={show}
                        aria-label={show ? "Hide password" : "Show password"}
                        aria-controls="reset-password"
                        onClick={() => setShow((v) => !v)}
                        data-testid="reset-show"
                      >
                        {show ? "Hide" : "Show"}
                      </button>
                    }
                  />
                  <StrengthMeter {...strength} />
                  <RequirementList strength={strength} />
                </div>

                <AuthField
                  ref={confirmRef}
                  id="reset-confirm"
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={(v) => {
                    setConfirm(v);
                    if (fieldError) setFieldError(null);
                    if (failure) setFailure(null);
                  }}
                  onBlur={() => setFieldError(confirm && confirm !== password ? RESET_MISMATCH : null)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
                  error={fieldError}
                  autoComplete="new-password"
                />

                {failure && (
                  <p className="signin-err" role="alert" data-testid="reset-failure">
                    {failure}
                  </p>
                )}

                <button
                  className="hero-btn primary signin-submit"
                  type="submit"
                  data-reveal
                  data-testid="reset-submit"
                  disabled={!canSubmit || submitting}
                  aria-busy={submitting || undefined}
                >
                  {submitting && <span className="signin-spin" aria-hidden="true" />}
                  <span className="hero-btn-label">Set new password</span>
                  {ARROW_RIGHT}
                  <span className="hero-shimmer" aria-hidden="true" />
                </button>

              </form>
            </div>
          )}
        </div>
      </div>

      <PadFlash ref={flashRef} reduced={reduced} />

      <p className="sr-only" aria-live="polite" data-testid="auth-live">
        {live}
      </p>
    </>
  );
}
