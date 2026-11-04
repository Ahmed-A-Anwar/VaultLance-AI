/* ProfileCard.tsx — name, address, role, and the payout address a freelancer
   would see. The address is read-only on purpose: changing it is an email flow
   the backend will own, so the button says what would happen and stops.

   Saving is the card's own beat: the spinner holds for 618ms at least, the
   button's check draws in, the card flashes success at 8%, and only then does
   the footer slide away. */

import { useEffect, useRef, useState } from "react";
import { SectionCard } from "../../../components/settings/SectionCard";
import { Field } from "../../../components/settings/Field";
import { DirtyFooter, type SaveState } from "../../../components/settings/DirtyFooter";
import { Camera } from "../../../components/settings/icons";
import { initialsOf } from "../../../components/settings/initials";
import { useToast } from "../../../components/shared/Toasts";
import { emailError } from "../../../lib/mockAuth";
import { updateProfile, updatePayoutProfile, type AccountProfile } from "../../../lib/api";

const SPIN = 618;

const nameError = (value: string): string | null => {
  const clean = value.trim();
  if (!clean) return "Enter your name.";
  if (clean.length < 2) return "Use at least 2 characters.";
  if (clean.length > 60) return "Use at most 60 characters.";
  return null;
};

/* the payout address is required for payouts and must be a real email; the
   same rule the mock's own writer enforces (lib/api updatePayoutProfile) */
const payoutErrorFor = (value: string): string | null => {
  if (!value.trim()) return "Where your payouts go: add a PayPal email.";
  return emailError(value);
};

export function ProfileCard({
  profile,
  onSaved,
  onDirty,
  resetSignal,
}: {
  profile: AccountProfile;
  onSaved: (next: AccountProfile) => void;
  onDirty: (dirty: boolean) => void;
  resetSignal: number;
}) {
  const push = useToast();
  const [name, setName] = useState(profile.fullName);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const [flash, setFlash] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const isFreelancer = profile.role === "freelancer";
  /* freelanners are paid to the address in this card; it is required and it must
     be a real email. Clients never see it. */
  const [payout, setPayout] = useState(profile.paypalEmail ?? "");
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const payoutTouched = useRef(false);

  const savedPayout = profile.paypalEmail ?? "";
  const payoutDirty = isFreelancer && payout !== savedPayout;
  const dirty = name !== profile.fullName || payoutDirty;

  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  /* a discarded draft and a saved one both come back from the profile */
  useEffect(() => {
    setName(profile.fullName);
    setError(null);
    setTouched(false);
    setPayout(savedPayout);
    setPayoutError(null);
    payoutTouched.current = false;
  }, [profile.fullName, savedPayout, resetSignal]);

  useEffect(() => {
    if (state !== "saved") return;
    const id = window.setTimeout(() => setState("idle"), 1000);
    return () => window.clearTimeout(id);
  }, [state]);

  const save = async () => {
    const problem = nameError(name);
    setTouched(true);
    if (problem) {
      setError(problem);
      input.current?.focus();
      return;
    }
    /* the payout address check only runs where the field exists; the saved
       value is what Discard and a failed save both come back to */
    const payoutProblem = isFreelancer ? payoutErrorFor(payout) : null;
    if (payoutProblem) {
      setPayoutError(payoutProblem);
      payoutTouched.current = true;
      return;
    }
    setError(null);
    setPayoutError(null);
    setState("saving");
    try {
      const [next] = await Promise.all([
        isFreelancer
          ? updatePayoutProfile({ paypalEmail: payout.trim() })
          : updateProfile({ fullName: name }),
        new Promise<void>((res) => window.setTimeout(res, SPIN)),
      ]);
      setState("saved");
      setFlash(true);
      window.setTimeout(() => setFlash(false), 382);
      push({ message: "Profile saved.", tone: "success" });
      onSaved(next);
    } catch (e) {
      setState("idle");
      push({ message: e instanceof Error ? e.message : "Couldn't save. Try again.", tone: "error" });
    }
  };

  return (
    <SectionCard
      id="profile"
      title="Profile"
      caption="HOW YOU APPEAR TO FREELANCERS"
      className={flash ? "is-flash" : undefined}
      footer={
        <DirtyFooter
          show={dirty}
          state={state}
          disabled={!!nameError(name) || (isFreelancer && !!payoutErrorFor(payout))}
          onDiscard={() => {
            setName(profile.fullName);
            setError(null);
            setTouched(false);
            setPayout(savedPayout);
            setPayoutError(null);
            payoutTouched.current = false;
          }}
          onSave={save}
          testId="profile-save"
        />
      }
    >
      <div className="set-profile-top">
        <button
          type="button"
          className="set-avatar-button"
          aria-label="Change profile photo"
          onClick={() => push({ message: "Photo upload comes with the real build." })}
        >
          <span className="set-avatar set-avatar-lg" aria-hidden="true">
            {initialsOf(profile.fullName)}
          </span>
          <span className="set-avatar-badge" aria-hidden="true">
            <Camera width="16" height="16" />
          </span>
        </button>
      </div>

      <div className="set-fields">
        <Field
          id="profile-name"
          label="Full name"
          value={name}
          onChange={(v) => {
            setName(v);
            if (touched) setError(nameError(v));
          }}
          onBlur={() => {
            setTouched(true);
            setError(nameError(name));
          }}
          error={error}
          autoComplete="name"
          ref={input}
          testId="profile-name"
        />

        <Field
          id="profile-email"
          label="Email"
          type="email"
          value={profile.email}
          readOnly
          locked
          hint="The address your vault links are sent to."
          inputMode="email"
          trailing={
            <button
              type="button"
              className="dash-btn dash-btn-ghost set-inline-btn"
              onClick={() => push({ message: "A confirmation link would be sent." })}
            >
              <span className="dash-btn-label">Change email</span>
            </button>
          }
        />

        <div className="set-field">
          <span className="set-label">Role</span>
          <div className="set-readonly-row">
            <span
              className={`dash-chip ${profile.role === "freelancer" ? "set-chip-freelancer" : "set-chip-client"}`}
              data-testid="profile-role"
            >
              {profile.role.toUpperCase()}
            </span>
            <span className="set-hint">Your role decides which side of a vault you see.</span>
          </div>
        </div>

        {/* freelancers are paid here: the one payout address the Overview
            banner and the Payments payout-method card also read. Editing it
            dirties the card like any other field; saving lands on PUT
            /v1/me/payout-profile. The chip answers "does this account
            currently have somewhere to be paid?" */}
        {isFreelancer && (
          <Field
            id="profile-paypal"
            label="PayPal payout email"
            value={payout}
            onChange={(v) => {
              setPayout(v);
              if (payoutTouched.current) setPayoutError(payoutErrorFor(v));
            }}
            onBlur={() => {
              payoutTouched.current = true;
              setPayoutError(payoutErrorFor(payout));
            }}
            error={payoutError}
            autoComplete="email"
            inputMode="email"
            testId="profile-paypal"
            labelExtra={
              <span
                className="dash-chip"
                data-testid="payout-status-chip"
              >
                {savedPayout ? "VERIFIED" : "NOT SET"}
              </span>
            }
            hint="Where your payout goes. Sandbox only."
          />
        )}
      </div>
    </SectionCard>
  );
}
