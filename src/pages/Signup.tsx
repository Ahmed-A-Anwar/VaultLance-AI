/* Signup.tsx — "/signup": the account form card in the left column, beside the
   vault that VaultLayout keeps mounted, with the role's path drawn in the strip
   to its left. The card joins the running transition when it is entered from the
   hero, and simply renders final on a direct load.

   Two steps: role, then details. Submit is local only — no network calls; the
   values go through the shared schema in lib/validations/auth.ts and the clean
   body is held for the API that replaces it. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import gsap from "gsap";
import { Link } from "react-router-dom";
import { useVaultScene } from "../lib/vaultScene";
import { SignupStepper, type Phase } from "../components/signup/SignupStepper";
import { ROLE_NAME, type Role } from "../components/signup/stepper-content";
import {
  signupSchema,
  toSignupPayload,
  type SignupInput,
  type SignupPayload,
  type SignupValues,
} from "../lib/validations/auth";

type Step = 1 | 2 | 3;

/* the field keys are the schema's; the DOM ids keep their older names so the
   e2e scripts and any saved links still find the inputs */
const FIELD_ID = {
  fullName: "name",
  email: "email",
  password: "password",
  paypalEmail: "paypal",
} as const;

type FieldName = keyof typeof FIELD_ID;

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
  const { control, register, handleSubmit, setValue, getValues, clearErrors, trigger, formState } =
    useForm<SignupInput, unknown, SignupValues>({
      resolver: zodResolver(signupSchema),
      /* errors arrive under a field when it is left, which is when a message is
         read rather than argued with */
      mode: "onBlur",
      defaultValues: { fullName: "", email: "", password: "", role: "client", paypalEmail: "" },
    });
  const { errors } = formState;
  /* the submit gate is checked against the live values, not formState.isValid:
     with mode "onBlur" that flag only catches up when a field loses focus, so
     filling the last field and clicking would hit a dead button */
  const canSubmit = signupSchema.safeParse(useWatch({ control })).success;
  /* the clean body a real submit would post; nothing sensitive is logged */
  const payload = useRef<SignupPayload | null>(null);
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

  /* selecting a role locks the path, then steps forward on the next beat. The
     role also decides whether a payout address is required, so a switch drops
     the old one and re-checks only the fields that already hold a value. */
  const pickRole = (next: Role) => {
    setRole(next);
    setPreview(null);
    setValue("role", next, { shouldValidate: true });
    setValue("paypalEmail", "", { shouldValidate: false });
    clearErrors("paypalEmail");
    const filled = (Object.keys(FIELD_ID) as FieldName[]).filter((key) => getValues(key) !== "");
    if (filled.length) void trigger(filled);
    if (advance.current) window.clearTimeout(advance.current);
    if (reduced) {
      move(2, 1);
      return;
    }
    advance.current = window.setTimeout(() => move(2, 1), 236);
  };

  const submit = handleSubmit((values) => {
    payload.current = toSignupPayload(values);
    /* the path lights first; the success card follows it */
    setPhase("done");
  });

  const field = (
    name: FieldName,
    label: string,
    type: string,
    opts: { autoComplete?: string; helper?: string; ref?: React.Ref<HTMLInputElement> } = {}
  ) => {
    const id = `signup-${FIELD_ID[name]}`;
    const message = errors[name]?.message;
    const { ref: registerRef, ...control } = register(name);
    return (
      <div className="signup-field" key={name}>
        <label className="signup-label" htmlFor={id}>
          {label}
        </label>
        <input
          {...control}
          ref={(el) => {
            registerRef(el);
            if (typeof opts.ref === "function") opts.ref(el);
            else if (opts.ref) opts.ref.current = el;
          }}
          id={id}
          className="signup-input"
          type={type}
          autoComplete={opts.autoComplete}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-err` : opts.helper ? `${id}-help` : undefined}
        />
        {opts.helper && !message && (
          <p className="signup-help" id={`${id}-help`}>
            {opts.helper}
          </p>
        )}
        {message && (
          <p className="signup-err" id={`${id}-err`}>
            {message}
          </p>
        )}
      </div>
    );
  };

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
                onClick={() => {
                  /* the payout address belongs to the role being left behind */
                  setValue("paypalEmail", "", { shouldValidate: false });
                  clearErrors("paypalEmail");
                  move(1, -1);
                }}
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
              {field("fullName", "Full name", "text", { autoComplete: "name", ref: nameRef })}
              {field("email", "Email", "email", { autoComplete: "email" })}
              {field("password", "Password", "password", {
                autoComplete: "new-password",
                helper: "12+ characters, mixing case, a number and a symbol.",
              })}
              {role === "freelancer" &&
                field("paypalEmail", "PayPal email", "email", {
                  autoComplete: "email",
                  helper: "Where your payout goes.",
                })}

              <button
                className="hero-btn primary signup-submit"
                type="submit"
                disabled={!canSubmit}
                data-testid="signup-submit"
              >
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
