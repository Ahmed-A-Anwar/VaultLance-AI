/* Signup.tsx — "/signup": the account form card in the left column, beside the
   vault that VaultLayout keeps mounted. The card joins the running transition
   when it is entered from the hero, and simply renders final on a direct load.

   Two steps: role, then details. Submit is local only — no network calls. */

import { useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import gsap from "gsap";
import { Link } from "react-router-dom";
import { useVaultScene } from "../lib/vaultScene";

type Role = "freelancer" | "client";
type Step = 1 | 2 | 3;

interface Values {
  name: string;
  email: string;
  password: string;
  paypal: string;
}

const EMPTY: Values = { name: "", email: "", password: "", paypal: "" };

const CHECK = (
  <svg className="role-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export default function Signup() {
  const { enterSignupCard, registerSignupCard, reduced } = useVaultScene();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const doneRef = useRef<HTMLHeadingElement | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [role, setRole] = useState<Role>("freelancer");
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const moving = useRef(false);

  /* the card hands itself to the transition, and keeps its rect for the way back */
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    registerSignupCard(card);
    enterSignupCard(card);
    const onResize = () => registerSignupCard(card);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enterSignupCard, registerSignupCard]);

  /* one step per screen: the outgoing panel leaves left, the next arrives from
     the right, 0.382s each */
  const move = (next: Step, dir: 1 | -1 = 1) => {
    const panel = panelRef.current;
    if (!panel || moving.current) return;
    const swap = () => {
      setStep(next);
      // a step swap takes the caret with it
      if (next === 2) requestAnimationFrame(() => nameRef.current?.focus());
      if (next === 3) requestAnimationFrame(() => doneRef.current?.focus());
    };
    if (reduced) {
      swap();
      return;
    }
    moving.current = true;
    gsap.to(panel, {
      x: -89 * dir,
      opacity: 0,
      duration: 0.382,
      ease: "power3.in",
      onComplete: () => {
        swap();
        gsap.fromTo(
          panel,
          { x: 89 * dir, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.382,
            ease: "power3.out",
            onComplete: () => {
              gsap.set(panel, { clearProps: "transform,opacity" });
              moving.current = false;
            },
          }
        );
      },
    });
  };

  const pickRole = (next: Role) => {
    setRole(next);
    move(2, 1);
  };

  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof Values, string>> = {};
    if (!values.name.trim()) next.name = "Enter the name on your account.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      next.email = "Enter a valid email address.";
    if (values.password.length < 8) next.password = "Use at least 8 characters.";
    if (role === "freelancer" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.paypal.trim()))
      next.paypal = "Enter the PayPal email your payout goes to.";
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      const el = document.querySelector<HTMLInputElement>(`#signup-${first}`);
      el?.focus();
      return false;
    }
    return true;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step !== 2 || !validate()) return;
    console.info("[signup] submit", { role, ...values });
    move(3, 1);
  };

  const field = (
    key: keyof Values,
    label: string,
    type: string,
    opts: { autoComplete?: string; helper?: string; ref?: React.Ref<HTMLInputElement> } = {}
  ) => (
    <div className="signup-field" key={key}>
      <label className="signup-label" htmlFor={`signup-${key}`}>
        {label}
      </label>
      <input
        ref={opts.ref}
        id={`signup-${key}`}
        className="signup-input"
        type={type}
        value={values[key]}
        onChange={set(key)}
        autoComplete={opts.autoComplete}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `signup-${key}-err` : opts.helper ? `signup-${key}-help` : undefined}
      />
      {opts.helper && !errors[key] && (
        <p className="signup-help" id={`signup-${key}-help`}>
          {opts.helper}
        </p>
      )}
      {errors[key] && (
        <p className="signup-err" id={`signup-${key}-err`}>
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <main id="main" className="signup-layout">
      <div className="signup-card" data-testid="signup-card" ref={cardRef}>
        <div className="signup-head">
          {/* a plain route link, so it works from a cold load too; the layout runs
              the reverse transition for any /signup -> / change. The ready state
              has its own "Back to the vault", so this steps aside there. */}
          {step !== 3 && (
            <Link className="signup-home" to="/" data-reveal data-testid="signup-back">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M11 5l-7 7 7 7" />
              </svg>
              Back
            </Link>
          )}
          <h1 className="signup-h1" data-reveal>
            Open your vault.
          </h1>
          <p className="signup-sub" data-reveal>
            Pick your role. Create your account.
          </p>
        </div>

        <p className="sr-only" role="status">
          {step === 1 ? "Step 1 of 2: your role." : step === 2 ? `Step 2 of 2: your details, ${role}.` : "Account ready."}
        </p>

        <div className="signup-panel" ref={panelRef} data-reveal>
          {step === 1 && (
            <div className="signup-roles" role="group" aria-label="Your role">
              <button
                type="button"
                className="role-btn"
                aria-pressed={role === "freelancer"}
                onClick={() => pickRole("freelancer")}
                data-testid="role-freelancer"
              >
                <span className="role-name">Freelancer:</span>
                <span className="role-line">I deliver work and get paid.</span>
                {CHECK}
              </button>
              <button
                type="button"
                className="role-btn"
                aria-pressed={role === "client"}
                onClick={() => pickRole("client")}
                data-testid="role-client"
              >
                <span className="role-name">Client:</span>
                <span className="role-line">I test work before I pay.</span>
                {CHECK}
              </button>
            </div>
          )}

          {step === 2 && (
            <form className="signup-form" onSubmit={submit} noValidate>
              {/* a step, not a page: the arrow stays on the card's Back */}
              <button type="button" className="signup-back" onClick={() => move(1, -1)}>
                Change role
              </button>

              {field("name", "Full name", "text", { autoComplete: "name", ref: nameRef })}
              {field("email", "Email", "email", { autoComplete: "email" })}
              {field("password", "Password", "password", { autoComplete: "new-password" })}
              {role === "freelancer" &&
                field("paypal", "PayPal email", "email", {
                  autoComplete: "email",
                  helper: "Where your payout goes.",
                })}

              <button className="hero-btn primary signup-submit" type="submit" data-testid="signup-submit">
                <span className="hero-btn-label">Create my vault</span>
              </button>

              <p className="signup-note">SANDBOX DEMO · NO REAL MONEY</p>
            </form>
          )}

          {step === 3 && (
            <div className="signup-done">
              <span className="signup-done-mark" aria-hidden="true">
                {CHECK}
              </span>
              <h2 className="signup-done-h" tabIndex={-1} ref={doneRef}>
                Your {role} vault is open.
              </h2>
              <p className="signup-done-p">
                Nothing was created and no money moved — this flow is a sandbox.
              </p>
              <Link className="signup-link" to="/">
                Back to the vault
              </Link>
            </div>
          )}
        </div>

        <p className="signup-foot" data-reveal>
          Already have a vault?{" "}
          <Link className="signup-link" to="/signin">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
