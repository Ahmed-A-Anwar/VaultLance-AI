/* Signin.tsx — "/signin": the unlock form card in the left column beside the
   vault that VaultLayout keeps mounted, with the keypad's state in the strip to
   its left. The card joins the running transition when it is entered from the
   hero, and simply renders final on a direct load.

   Submit is local only — no network calls. The rules live in lib/mockAuth. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import gsap from "gsap";
import { Link, useNavigate } from "react-router-dom";
import { useVaultScene } from "../lib/vaultScene";
import { emailError, passwordError, signIn } from "../lib/mockAuth";
import "../styles/signin.css";

type Status = "ready" | "rejected" | "accepted";
type Phase = "idle" | "checking";

const STATUS_LABEL: Record<Status, string> = {
  ready: "KEYPAD READY",
  rejected: "CODE REJECTED",
  accepted: "CODE ACCEPTED",
};

/* the button's own beat before the vault answers */
const SPIN = 618;
/* how long "code rejected" stays up before the keypad is ready again */
const REJECT_HOLD = 1618;

const ARROW = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 5l-7 7 7 7" />
  </svg>
);

const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms));

/* one mono line: in the strip beside the card on desktop, above the heading
   once the strip is gone. Only the one the media query shows reaches the
   accessibility tree, so it is announced once. */
function StatusLine({ status, inline = false }: { status: Status; inline?: boolean }) {
  return (
    <p
      className={`signin-status is-${status}${inline ? " signin-status-inline" : ""}`}
      role="status"
      data-testid={inline ? "signin-status-inline" : "signin-status"}
    >
      <span className="signin-status-dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </p>
  );
}

export default function Signin() {
  const { enterSigninCard, registerSigninCard, padEnter, fx, reduced, padFail } = useVaultScene();
  const navigate = useNavigate();

  const cardRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const rejectTimer = useRef<number | null>(null);
  const alive = useRef(true);

  const [status, setStatus] = useState<Status>("ready");
  const [phase, setPhase] = useState<Phase>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);

  /* the card hands itself to the transition, and keeps its rect for the way back */
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    registerSigninCard(card);
    enterSigninCard(card);
    const onResize = () => registerSigninCard(card);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enterSigninCard, registerSigninCard]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (rejectTimer.current) window.clearTimeout(rejectTimer.current);
    };
  }, []);

  /* the flat CSS keypad stands in when the clip cannot run: reduced motion, or
     frames that never arrived */
  useEffect(() => {
    if (!reduced && !padFail) return;
    fx.current?.signInHover(true);
  }, [fx, reduced, padFail]);

  const fieldError = {
    email: errors.email ?? null,
    password: errors.password ?? null,
  };

  const validate = () => {
    const next = {
      email: emailError(email) ?? undefined,
      password: passwordError(password) ?? undefined,
    };
    setErrors(next);
    if (next.email) emailRef.current?.focus();
    else if (next.password) passwordRef.current?.focus();
    return !next.email && !next.password;
  };

  /* the red the keypad answers a bad code with: one flash over the keypad's own
     rect, multiplied into the metal */
  const flashPad = () => {
    const pad = document.querySelector(".hero-keypad");
    const flash = flashRef.current;
    if (!pad || !flash || reduced) return;
    const r = pad.getBoundingClientRect();
    Object.assign(flash.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    gsap.killTweensOf(flash);
    gsap.fromTo(flash, { opacity: 0.5 }, { opacity: 0, duration: 0.382, ease: "power2.out" });
  };

  const shake = () => {
    const card = cardRef.current;
    if (!card || reduced) return;
    gsap.killTweensOf(card);
    gsap.to(card, {
      keyframes: [{ x: -8 }, { x: 8 }, { x: -4 }, { x: 0 }],
      duration: 0.382,
      ease: "power2.out",
      onComplete: () => gsap.set(card, { clearProps: "transform" }),
    });
  };

  const fail = (message: string) => {
    setFailure(message);
    setStatus("rejected");
    flashPad();
    shake();
    if (rejectTimer.current) window.clearTimeout(rejectTimer.current);
    rejectTimer.current = window.setTimeout(() => {
      if (alive.current) setStatus("ready");
    }, REJECT_HOLD);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (phase === "checking") return;
    if (!validate()) return;

    setFailure(null);
    setPhase("checking");
    const result = await signIn({ email, password });
    await wait(SPIN);
    if (!alive.current) return;

    if (!result.ok) {
      setPhase("idle");
      fail(result.error);
      return;
    }

    /* accepted: the strip says so while the clip runs the code entry, and the
       route changes when it lands (or on the 2.618s beat if it cannot) */
    setStatus("accepted");
    await padEnter();
    if (!alive.current) return;
    navigate("/dashboard");
  };

  const setEmailField = (v: string) => {
    setEmail(v);
    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
    if (failure) setFailure(null);
  };
  const setPasswordField = (v: string) => {
    setPassword(v);
    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
    if (failure) setFailure(null);
  };

  return (
    <main id="main" className="signin-layout">
      <div className="signin-brand">
        <span className="signin-wordmark">VaultPay AI</span>
        <Link className="signin-home" to="/" data-testid="signin-back">
          {ARROW}
          Back
        </Link>
      </div>

      <div className="signin-rail">
        <StatusLine status={status} />
      </div>

      <div className="signin-card" data-testid="signin-card" ref={cardRef}>
        <div className="signin-head">
          <StatusLine status={status} inline />
          <h1 className="signin-h1" data-reveal>
            Unlock your vault.
          </h1>
          <p className="signin-sub" data-reveal>
            Enter your email and password.
          </p>
        </div>

        <form className="signin-form" onSubmit={submit} noValidate>
          <div className="signin-field" data-reveal>
            <label className="signin-label" htmlFor="signin-email">
              Email
            </label>
            <input
              ref={emailRef}
              id="signin-email"
              className="signin-input"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmailField(e.target.value)}
              onBlur={() => setErrors((prev) => ({ ...prev, email: emailError(email) ?? undefined }))}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={fieldError.email ? true : undefined}
              aria-describedby={fieldError.email ? "signin-email-err" : undefined}
            />
            {fieldError.email && (
              <p className="signin-err" id="signin-email-err">
                {fieldError.email}
              </p>
            )}
          </div>

          <div className="signin-field" data-reveal>
            <label className="signin-label" htmlFor="signin-password">
              Password
            </label>
            <div className="signin-pw">
              <input
                ref={passwordRef}
                id="signin-password"
                className="signin-input"
                type={show ? "text" : "password"}
                name="password"
                value={password}
                onChange={(e) => setPasswordField(e.target.value)}
                onBlur={() =>
                  setErrors((prev) => ({ ...prev, password: passwordError(password) ?? undefined }))
                }
                autoComplete="current-password"
                aria-invalid={fieldError.password ? true : undefined}
                aria-describedby={fieldError.password ? "signin-password-err" : undefined}
              />
              <button
                type="button"
                className="signin-eye"
                aria-pressed={show}
                aria-controls="signin-password"
                onClick={() => setShow((v) => !v)}
                data-testid="signin-show"
              >
                {show ? "Hide" : "Show"}
                <span className="sr-only"> password</span>
              </button>
            </div>
            {fieldError.password && (
              <p className="signin-err" id="signin-password-err">
                {fieldError.password}
              </p>
            )}
          </div>

          <div className="signin-row" data-reveal>
            <a className="signin-forgot" href="#" data-testid="signin-forgot">
              Forgot password?
            </a>
          </div>

          <button
            className="hero-btn primary signin-submit"
            type="submit"
            data-testid="signin-submit"
            data-reveal
            disabled={phase === "checking"}
            aria-busy={phase === "checking" || undefined}
          >
            {phase === "checking" && <span className="signin-spin" aria-hidden="true" />}
            <span className="hero-btn-label">Unlock my vault</span>
          </button>

          {failure && (
            <p className="signin-err signin-failure" role="alert" data-testid="signin-failure">
              {failure}
            </p>
          )}

          <p className="signin-note" data-reveal>
            SANDBOX DEMO · NO REAL MONEY
          </p>
        </form>

        <p className="signin-foot" data-reveal>
          New here?{" "}
          <Link className="signin-link" to="/signup">
            Create a vault
          </Link>
        </p>
      </div>

      {/* the keypad's refusal, multiplied into its own rect */}
      <div className="signin-flash" ref={flashRef} aria-hidden="true" data-testid="signin-flash" />
    </main>
  );
}
