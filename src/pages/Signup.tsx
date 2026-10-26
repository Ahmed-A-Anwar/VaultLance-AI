/* Signup.tsx — "/signup": the account form card in the left column, beside the
   vault that VaultLayout keeps mounted, with the role's path drawn in the strip
   to its left. The card joins the running transition when it is entered from the
   hero, and simply renders final on a direct load.

   Two steps: role, then details. Submit is local only — no network calls. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import gsap from "gsap";
import { Link } from "react-router-dom";
import { useVaultScene } from "../lib/vaultScene";
import { SignupStepper, type Phase } from "../components/signup/SignupStepper";
import { ROLE_NAME, type Role } from "../components/signup/stepper-content";

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

const ARROW = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 5l-7 7 7 7" />
  </svg>
);

/* line icons: an upload arrow for the freelancer, a magnifier for the client */
const ROLE_ICON: Record<Role, React.ReactNode> = {
  freelancer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4M6.5 9.5 12 4l5.5 5.5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  client: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
  ),
};

export default function Signup() {
  const { enterSignupCard, registerSignupCard, reduced } = useVaultScene();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const doneRef = useRef<HTMLHeadingElement | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [preview, setPreview] = useState<Role | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const moving = useRef(false);
  const stepRef = useRef<Step>(1);
  const queued = useRef<{ step: Step; dir: 1 | -1 } | null>(null);
  const advance = useRef<number | null>(null);

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

  useEffect(
    () => () => {
      if (advance.current) window.clearTimeout(advance.current);
    },
    []
  );

  /* one step per screen: the outgoing panel leaves left, the next arrives from
     the right, 0.382s each */
  const move = (next: Step, dir: 1 | -1 = 1) => {
    const panel = panelRef.current;
    if (!panel) return;
    /* a click that lands while a step is still sliding is honoured rather than
       dropped: it waits for the running move to land, then runs. Dropping it
       made "Change role" look dead if it was clicked right after arriving. */
    if (moving.current) {
      queued.current = { step: next, dir };
      return;
    }
    const swap = () => {
      stepRef.current = next;
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
              const nextMove = queued.current;
              queued.current = null;
              if (nextMove && nextMove.step !== stepRef.current) move(nextMove.step, nextMove.dir);
            },
          }
        );
      },
    });
  };

  /* selecting a role locks the path, then steps forward on the next beat */
  const pickRole = (next: Role) => {
    setRole(next);
    setPreview(null);
    if (advance.current) window.clearTimeout(advance.current);
    if (reduced) {
      move(2, 1);
      return;
    }
    advance.current = window.setTimeout(() => move(2, 1), 236);
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
    /* the path lights first; the success card follows it */
    setPhase("done");
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
      <div className="signup-brand">
        <span className="signup-wordmark">VaultLance AI</span>
        <Link className="signup-home" to="/" data-testid="signup-back">
          {ARROW}
          Back
        </Link>
      </div>

      <div className="signup-rail">
        <SignupStepper
          variant="vertical"
          role={role}
          preview={preview}
          phase={phase}
          reduced={reduced}
          onDone={() => move(3, 1)}
        />
      </div>

      <div className="signup-card" data-testid="signup-card" ref={cardRef}>
        <div className="signup-head">
          <h1 className="signup-h1" data-reveal>
            Open your vault.
          </h1>

          <div className="signup-subrow" data-reveal>
            <p className="signup-sub">
              {step === 1 ? "Pick your role. Create your account." : role ? `${ROLE_NAME[role]} account` : ""}
            </p>
            {step === 2 && (
              <button
                type="button"
                className="signup-chip"
                onClick={() => move(1, -1)}
                data-testid="signup-change-role"
              >
                Change role
              </button>
            )}
          </div>

          {/* the compact path lives in the card under the heading, under 1100px */}
          <div className="signup-stepper-compact" data-reveal>
            <SignupStepper
              variant="compact"
              role={role}
              preview={preview}
              phase={phase}
              reduced={reduced}
              onDone={() => move(3, 1)}
            />
          </div>
        </div>

        <p className="sr-only" role="status">
          {step === 1 ? "Step 1 of 2: your role." : step === 2 ? `Step 2 of 2: your details, ${role}.` : "Account ready."}
        </p>

        <div className="signup-panel" ref={panelRef} data-reveal>
          {step === 1 && (
            <div className="signup-roles" role="group" aria-label="Your role">
              {(["freelancer", "client"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className="role-btn"
                  aria-pressed={role === r}
                  onClick={() => pickRole(r)}
                  onMouseEnter={() => setPreview(r)}
                  onMouseLeave={() => setPreview((v) => (v === r ? null : v))}
                  onFocus={() => setPreview(r)}
                  onBlur={() => setPreview((v) => (v === r ? null : v))}
                  data-testid={`role-${r}`}
                >
                  <span className="role-title">{ROLE_NAME[r]}</span>
                  <span className="role-line">
                    {r === "freelancer" ? "I deliver work and get paid." : "I test work before I pay."}
                  </span>
                  <span className="role-icon" aria-hidden="true">
                    {ROLE_ICON[r]}
                  </span>
                  {CHECK}
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <form className="signup-form" onSubmit={submit} noValidate>
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
