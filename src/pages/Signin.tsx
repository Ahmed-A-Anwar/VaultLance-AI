/* Signin.tsx — "/signin": the unlock form card in the left column beside the
   vault that VaultLayout keeps mounted, with the keypad's state in the strip to
   its left. The card joins the running transition when it is entered from the
   hero, and simply renders final on a direct load. */

import { useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useVaultScene } from "../lib/vaultScene";
import "../styles/signin.css";

type Status = "ready" | "rejected" | "accepted";

const STATUS_LABEL: Record<Status, string> = {
  ready: "KEYPAD READY",
  rejected: "CODE REJECTED",
  accepted: "CODE ACCEPTED",
};

const ARROW = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 5l-7 7 7 7" />
  </svg>
);

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
  const { enterSigninCard, registerSigninCard } = useVaultScene();
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<Status>("ready");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    console.info("[signin] submit", { email, password, status: setStatus });
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
              id="signin-email"
              className="signin-input"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="signin-field" data-reveal>
            <label className="signin-label" htmlFor="signin-password">
              Password
            </label>
            <div className="signin-pw">
              <input
                id="signin-password"
                className="signin-input"
                type={show ? "text" : "password"}
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
          >
            <span className="hero-btn-label">Unlock my vault</span>
          </button>

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
    </main>
  );
}
