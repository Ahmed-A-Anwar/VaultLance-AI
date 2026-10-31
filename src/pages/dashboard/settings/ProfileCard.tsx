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
import { updateProfile, type AccountProfile } from "../../../lib/api";

const SPIN = 618;

const nameError = (value: string): string | null => {
  const clean = value.trim();
  if (!clean) return "Enter your name.";
  if (clean.length < 2) return "Use at least 2 characters.";
  if (clean.length > 60) return "Use at most 60 characters.";
  return null;
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

  const dirty = name !== profile.fullName;

  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  /* a discarded draft and a saved one both come back from the profile */
  useEffect(() => {
    setName(profile.fullName);
    setError(null);
    setTouched(false);
  }, [profile.fullName, resetSignal]);

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
    setError(null);
    setState("saving");
    try {
      const [next] = await Promise.all([
        updateProfile({ fullName: name }),
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
          disabled={!!nameError(name)}
          onDiscard={() => {
            setName(profile.fullName);
            setError(null);
            setTouched(false);
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
            <span className="dash-chip set-chip-client">{profile.role.toUpperCase()}</span>
            <span className="set-hint">Your role decides which side of a vault you see.</span>
          </div>
        </div>

        {/* freelancers are paid here; the field is part of the profile config, not
            a special case at the call site */}
        {profile.role === "freelancer" && profile.paypalEmail && (
          <Field id="profile-paypal" label="PayPal payout email" value={profile.paypalEmail} readOnly locked />
        )}
      </div>
    </SectionCard>
  );
}
