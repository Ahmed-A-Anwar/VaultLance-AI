/* SecurityCard.tsx — three blocks on one card, separated by hairlines:

   1. the password change, with the same five-bolt meter the reset flow uses
      (components/auth/StrengthMeter, so there is one implementation of the rules)
   2. two-factor, with a mock enrolment sheet and six code boxes
   3. the device list, where every removal costs two clicks

   Nothing here is a settings "section" with a save footer: each block commits on
   its own, the way a password change should. */

import { useEffect, useRef, useState } from "react";
import { SectionCard } from "../../../components/settings/SectionCard";
import { Field } from "../../../components/settings/Field";
import { Switch } from "../../../components/settings/Switch";
import { Modal } from "../../../components/settings/Modal";
import { OtpBoxes } from "../../../components/settings/OtpBoxes";
import { TwoStepButton } from "../../../components/settings/TwoStepButton";
import { Laptop, Monitor, Phone, Key } from "../../../components/settings/icons";
import { RequirementList, StrengthMeter, strengthOf } from "../../../components/auth/StrengthMeter";
import { useToast } from "../../../components/shared/Toasts";
import {
  TWO_FACTOR_BAD_CODE,
  TWO_FACTOR_SECRET,
  changePassword,
  confirmTwoFactor,
  disableTwoFactor,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  startTwoFactor,
  type LoginSession,
} from "../../../lib/api";
import { WRONG_CURRENT_PASSWORD } from "../../../lib/mockAuth";

const SPIN = 618;
const SHAKE = 382;

const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms));

const Eye = ({ crossed = false }: { crossed?: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="2.6" />
    {crossed && <path d="m4 20 16-16" />}
  </svg>
);

function Reveal({
  id,
  shown,
  toggle,
  label,
}: {
  id: string;
  shown: boolean;
  toggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="set-reveal"
      aria-pressed={shown}
      aria-label={`${shown ? "Hide" : "Show"} ${label}`}
      aria-controls={id}
      onClick={toggle}
    >
      <Eye crossed={shown} />
    </button>
  );
}

const deviceIcon = (device: string) =>
  /iphone|android|phone/i.test(device) ? Phone : /macos|linux/i.test(device) ? Monitor : Laptop;

export function SecurityCard({ mfaOn, onMfaChange }: { mfaOn: boolean; onMfaChange: (on: boolean) => void }) {
  const push = useToast();

  /* ---- password ---- */
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState({ current: false, next: false, confirm: false });
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [signedOut, setSignedOut] = useState<Set<string>>(new Set());
  const currentRef = useRef<HTMLInputElement | null>(null);
  const nextRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLInputElement | null>(null);

  const strength = strengthOf(next);
  const canSubmit = current.length > 0 && strength.level >= 2 && confirm === next;

  const bump = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), SHAKE);
  };

  /* ---- two-factor ---- */
  const [mfaOpen, setMfaOpen] = useState(false);
  const [secret, setSecret] = useState(TWO_FACTOR_SECRET);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeOk, setCodeOk] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [askOff, setAskOff] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);

  /* ---- sessions ---- */
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listSessions()
      .then((rows) => {
        if (live) setSessions(rows);
      })
      .catch((e) => {
        if (live) setSessionError(e instanceof Error ? e.message : "Couldn't load your sessions.");
      });
    return () => {
      live = false;
    };
  }, []);

  const submitPassword = async () => {
    if (busy) return;
    if (!current) {
      setCurrentError("Enter your current password.");
      currentRef.current?.focus();
      return;
    }
    if (strength.level < 2) {
      nextRef.current?.focus();
      return;
    }
    if (confirm !== next) {
      setMismatch("Passwords don't match.");
      confirmRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const [result] = await Promise.all([changePassword(current, next), wait(SPIN)]);
      const gone = sessions.filter((row) => !result.sessions.some((kept) => kept.id === row.id));
      setSignedOut(new Set(gone.map((row) => row.id)));
      push({ message: "Password updated.", tone: "success" });
      setCurrent("");
      setNext("");
      setConfirm("");
      setCurrentError(null);
      setMismatch(null);
      window.setTimeout(() => {
        setSessions(result.sessions);
        setSignedOut(new Set());
      }, 1618);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't change the password.";
      if (message === WRONG_CURRENT_PASSWORD) {
        setCurrentError(message);
        currentRef.current?.focus();
        bump();
      } else {
        push({ message, tone: "error" });
      }
    } finally {
      setBusy(false);
    }
  };

  const openMfa = async () => {
    setMfaOpen(true);
    setCode("");
    setCodeError(null);
    setCodeOk(false);
    try {
      const { secret: value } = await startTwoFactor();
      setSecret(value);
    } catch {
      /* the printed secret is the fallback: the sheet can still be completed */
    }
  };

  const verify = async () => {
    if (verifying) return;
    setVerifying(true);
    try {
      await Promise.all([confirmTwoFactor(code), wait(SPIN)]);
      setCodeOk(true);
      setCodeError(null);
      window.setTimeout(() => {
        setMfaOpen(false);
        onMfaChange(true);
        push({ message: "Two-factor is on.", tone: "success" });
      }, SPIN);
    } catch (e) {
      setCodeOk(false);
      setCodeError(e instanceof Error ? e.message : TWO_FACTOR_BAD_CODE);
    } finally {
      setVerifying(false);
    }
  };

  const turnOff = async () => {
    setMfaBusy(true);
    try {
      await disableTwoFactor();
      onMfaChange(false);
      setAskOff(false);
      push({ message: "Two-factor is off.", tone: "info" });
    } catch (e) {
      push({ message: e instanceof Error ? e.message : "Couldn't turn it off.", tone: "error" });
    } finally {
      setMfaBusy(false);
    }
  };

  const drop = async (id: string) => {
    setSessionError(null);
    try {
      const rows = await revokeSession(id);
      setLeaving(id);
      window.setTimeout(() => {
        setSessions(rows);
        setLeaving(null);
      }, SHAKE);
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : "Couldn't revoke that session.");
    }
  };

  const dropAll = async () => {
    setSessionError(null);
    try {
      const rows = await revokeOtherSessions();
      setSessions(rows);
      push({ message: "Other sessions signed out.", tone: "success" });
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : "Couldn't sign the others out.");
    }
  };

  return (
    <SectionCard id="security" title="Security" caption="PASSWORD, TWO-FACTOR AND DEVICES" className={shake ? "is-shake" : undefined}>
      {/* ---- 1. password ---- */}
      <div className="set-block">
        <div className="set-block-head">
          <h3 className="set-block-h">
            <Key width="16" height="16" /> Change password
          </h3>
          <p className="set-block-sub">Choose something you have not used on another site.</p>
        </div>

        {/* a form, so Enter in any of the three fields commits the same way the
            button does */}
        <form
          className="set-fields set-fields-narrow"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submitPassword();
          }}
        >
          <Field
            id="pw-current"
            label="Current password"
            type={shown.current ? "text" : "password"}
            value={current}
            onChange={(v) => {
              setCurrent(v);
              setCurrentError(null);
            }}
            error={currentError}
            alert={!!currentError}
            autoComplete="current-password"
            ref={currentRef}
            testId="pw-current"
            trailing={
              <Reveal
                id="pw-current"
                shown={shown.current}
                toggle={() => setShown((s) => ({ ...s, current: !s.current }))}
                label="current password"
              />
            }
          />

          <div className="set-strength">
            <Field
              id="pw-new"
              label="New password"
              type={shown.next ? "text" : "password"}
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              ref={nextRef}
              testId="pw-new"
              trailing={
                <Reveal
                  id="pw-new"
                  shown={shown.next}
                  toggle={() => setShown((s) => ({ ...s, next: !s.next }))}
                  label="new password"
                />
              }
            />
            <StrengthMeter {...strength} />
            <RequirementList strength={strength} />
          </div>

          <Field
            id="pw-confirm"
            label="Confirm new password"
            type={shown.confirm ? "text" : "password"}
            value={confirm}
            onChange={(v) => {
              setConfirm(v);
              setMismatch(null);
            }}
            onBlur={() => setMismatch(confirm && confirm !== next ? "Passwords don't match." : null)}
            error={mismatch}
            autoComplete="new-password"
            ref={confirmRef}
            testId="pw-confirm"
            trailing={
              <Reveal
                id="pw-confirm"
                shown={shown.confirm}
                toggle={() => setShown((s) => ({ ...s, confirm: !s.confirm }))}
                label="confirmation"
              />
            }
          />

          <button
            type="submit"
            className="dash-btn dash-btn-primary set-btn-55"
            disabled={!canSubmit || busy}
            data-testid="pw-update"
          >
            {busy && <span className="dash-spin" aria-hidden="true" />}
            <span className="dash-btn-label">{busy ? "Updating…" : "Update password"}</span>
          </button>
        </form>
      </div>

      {/* ---- 2. two-factor ---- */}
      <div className="set-block">
        <div className="set-block-head set-block-row">
          <div>
            <h3 className="set-block-h">
              <Laptop width="16" height="16" /> Two-factor authentication
            </h3>
            <p className="set-block-sub">
              {mfaOn ? "On — a six-digit code is asked for at sign-in." : "Off — a code adds a second step at sign-in."}
            </p>
          </div>
          <Switch
            checked={mfaOn}
            label="Two-factor authentication"
            testId="mfa-switch"
            disabled={mfaBusy}
            onChange={(on) => {
              if (on) {
                void openMfa();
              } else {
                setAskOff(true);
              }
            }}
          />
        </div>

        {askOff && mfaOn && (
          <div className="set-inline-confirm" data-testid="mfa-off-confirm">
            <p className="set-inline-text">Turn off two-factor?</p>
            <TwoStepButton
              label="Turn off"
              confirmLabel="Click again to turn off"
              className="dash-btn-danger set-two-dark"
              onConfirm={turnOff}
              disabled={mfaBusy}
              testId="mfa-off"
            />
          </div>
        )}
      </div>

      {/* ---- 3. sessions ---- */}
      <div className="set-block">
        <div className="set-block-head">
          <h3 className="set-block-h">
            <Monitor width="16" height="16" /> Active sessions
          </h3>
          <p className="set-block-sub">Signing out a device ends its access immediately.</p>
        </div>

        <ul className="set-sessions">
          {sessions.map((row) => {
            const Icon = deviceIcon(row.device);
            return (
              <li
                key={row.id}
                className="set-session"
                data-leaving={leaving === row.id ? "1" : "0"}
                data-testid={`session-${row.id}`}
              >
                <span className="set-session-icon" aria-hidden="true">
                  <Icon width="18" height="18" />
                </span>
                <div className="set-session-copy">
                  <p className="set-session-device">
                    {row.device} · {row.place}
                  </p>
                  <p className="set-session-meta">
                    {signedOut.has(row.id) ? "SIGNED OUT AFTER PASSWORD CHANGE" : row.lastActive.toUpperCase()}
                  </p>
                </div>
                {row.current ? (
                  <span className="dash-chip set-chip-client set-session-this">THIS DEVICE</span>
                ) : (
                  <TwoStepButton
                    label="Revoke"
                    confirmLabel="Confirm revoke"
                    className="dash-btn-ghost set-revoke"
                    onConfirm={() => void drop(row.id)}
                    testId={`revoke-${row.id}`}
                  />
                )}
              </li>
            );
          })}
        </ul>

        {sessions.length > 1 && (
          <TwoStepButton
            label="Sign out all other sessions"
            confirmLabel="Confirm: sign out the others"
            className="dash-btn-ghost set-btn-55 set-allout"
            onConfirm={() => void dropAll()}
            testId="signout-all"
          />
        )}

        {sessionError && (
          <p className="set-err" role="alert">
            {sessionError}
          </p>
        )}
      </div>

      <Modal open={mfaOpen} title="Set up two-factor" onClose={() => setMfaOpen(false)} testId="mfa-modal">
        <div className="set-mfa">
          <div className="set-qr-wrap">
            <div className="set-qr" aria-hidden="true">
              {Array.from({ length: 169 }, (_, i) => {
                const row = Math.floor(i / 13);
                const col = i % 13;
                /* three finder squares, then a fixed scatter: it reads as a QR
                   without pretending to encode a secret */
                const finder = (r: number, c: number) =>
                  (r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
                const on =
                  (row < 7 && col < 7 && finder(row, col)) ||
                  (row < 7 && col > 5 && finder(row, col - 6)) ||
                  (row > 5 && col < 7 && finder(row - 6, col)) ||
                  (row > 6 && col > 6 && (row * 31 + col * 17 + row * col * 7) % 11 < 5);
                return <span key={i} className="set-qr-cell" data-on={on ? "1" : "0"} />;
              })}
            </div>
            <p className="set-qr-label">MOCK</p>
          </div>

          <p className="set-hint">Scan the code, or type the key into your authenticator.</p>
          <p className="set-secret" data-testid="mfa-secret">
            {secret}
          </p>

          <OtpBoxes
            value={code}
            onChange={(v) => {
              setCode(v);
              setCodeError(null);
            }}
            error={!!codeError}
            success={codeOk}
            disabled={verifying || codeOk}
          />

          {codeError && (
            <p className="set-err" role="alert" data-testid="mfa-code-err">
              {codeError}
            </p>
          )}

          <div className="set-modal-actions">
            <button type="button" className="dash-btn dash-btn-ghost set-btn-55" onClick={() => setMfaOpen(false)}>
              <span className="dash-btn-label">Cancel</span>
            </button>
            <button
              type="button"
              className="dash-btn dash-btn-primary set-btn-55"
              disabled={code.length !== 6 || verifying || codeOk}
              onClick={verify}
              data-testid="mfa-confirm"
            >
              {verifying && <span className="dash-spin" aria-hidden="true" />}
              <span className="dash-btn-label">{codeOk ? "Verified" : "Confirm code"}</span>
            </button>
          </div>
        </div>
      </Modal>
    </SectionCard>
  );
}
