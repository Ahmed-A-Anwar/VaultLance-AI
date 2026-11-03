/* VaultCard.tsx — one vault, 144px tall, two columns: what it is on the left
   (project, phase, client, amount, the five bolts) and what it needs on the
   right (a hint and up to two actions).

   Two actions are irreversible enough to ask twice: submitting a manifest and
   deleting a draft. Both put the state in the label — "Confirm submit" — with
   a three-second countdown line, so the second click is a decision and not a
   reflex. */

import { useEffect, useRef, useState } from "react";
import { Wheel } from "../dashboard/icons";
import { formatCents } from "../../lib/fees";
import type { Phase } from "../../lib/freelancerPhase";
import type { FreelancerVault } from "./mockApi";
import { FreelancerStepper } from "./FreelancerStepper";
import { PhaseChip } from "./PhaseChip";

export type VaultAction =
  | "setup"
  | "invite"
  | "remind"
  | "upload"
  | "addFiles"
  | "submit"
  | "retry"
  | "duplicate"
  | "delete"
  | "receipt"
  | "details";

const HINT: Record<Phase, string> = {
  draft: "Finish setting up and invite your client.",
  invited: "Waiting for your client to authorize payment.",
  funded: "Funds are secured. Deliver your files.",
  submitted: "Manifest locked. Waiting for your client to audit.",
  in_review: "Your client finished the audit and is deciding.",
  paid_pending: "Your payout is on its way.",
  paid: "Paid out.",
  payout_failed: "PayPal couldn’t send the payout. Check your PayPal email.",
  voided: "Hold voided. Funds returned to the client.",
};

interface Props {
  vault: FreelancerVault;
  phase: Phase;
  index: number;
  busy: boolean;
  remindLabel?: string | null;
  onAction: (action: VaultAction, vault: FreelancerVault) => void;
}

export function VaultCard({ vault, phase, index, busy, remindLabel, onAction }: Props) {
  const [confirm, setConfirm] = useState<null | "submit" | "delete">(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!confirm) return;
    timer.current = window.setTimeout(() => setConfirm(null), 3000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [confirm]);

  const twoStep = (kind: "submit" | "delete") => {
    if (confirm === kind) {
      setConfirm(null);
      onAction(kind, vault);
      return;
    }
    setConfirm(kind);
  };

  const dimmed = phase === "voided";
  const needsFiles = vault.filesCount === 0;

  return (
    <article
      className="fd-card"
      data-phase={phase}
      data-dim={dimmed ? "true" : undefined}
      data-enter="vault"
      style={{ animationDelay: `${index * 61.8}ms` }}
      aria-label={`${vault.project} with ${vault.clientName}, ${formatCents(vault.amountCents)}, ${
        phase === "in_review" ? "in review" : phase.replace("_", " ")
      }`}
    >
      <div className="fd-card-left">
        <div className="fd-card-head">
          <h3 className="fd-card-project">{vault.project}</h3>
          <PhaseChip phase={phase} />
        </div>

        <p className="fd-card-meta">
          <span>{vault.clientName}</span>
          <span className="fd-card-amount">{formatCents(vault.amountCents)}</span>
        </p>

        <FreelancerStepper phase={phase} />
      </div>

      <div className="fd-card-right">
        <button
          type="button"
          className="fd-info"
          aria-label={`Details for ${vault.project}`}
          onClick={() => onAction("details", vault)}
        >
          <Wheel width="14" height="14" />
        </button>

        <p className="fd-card-hint">{HINT[phase]}</p>

        <div className="fd-card-actions">
          {busy && <span className="fd-spin" aria-hidden="true" />}

          {phase === "draft" && (
            <>
              <button type="button" className="fd-btn fd-btn-primary" disabled={busy} onClick={() => onAction("setup", vault)}>
                Continue setup
              </button>
              <button
                type="button"
                className="fd-btn fd-btn-ghost is-danger"
                disabled={busy}
                onClick={() => twoStep("delete")}
              >
                {confirm === "delete" ? "Confirm delete" : "Delete draft"}
              </button>
            </>
          )}

          {phase === "invited" && (
            <>
              <button type="button" className="fd-btn fd-btn-secondary" disabled={busy} onClick={() => onAction("invite", vault)}>
                Copy invite link
              </button>
              <button
                type="button"
                className="fd-btn fd-btn-ghost fd-btn-mono"
                disabled={busy || !!remindLabel}
                onClick={() => onAction("remind", vault)}
              >
                {remindLabel ?? "Remind client"}
              </button>
            </>
          )}

          {phase === "funded" && (
            <>
              <button
                type="button"
                className="fd-btn fd-btn-primary"
                disabled={busy}
                onClick={() => (needsFiles ? onAction("upload", vault) : twoStep("submit"))}
              >
                {needsFiles ? "Upload files" : confirm === "submit" ? "Confirm submit" : "Submit for review"}
              </button>
              <button type="button" className="fd-btn fd-btn-secondary" disabled={busy} onClick={() => onAction(needsFiles ? "upload" : "addFiles", vault)}>
                {needsFiles ? "Upload files" : "Add files"}
              </button>
            </>
          )}

          {phase === "submitted" && (
            <button
              type="button"
              className="fd-btn fd-btn-ghost fd-btn-mono"
              disabled={busy || !!remindLabel}
              onClick={() => onAction("remind", vault)}
            >
              {remindLabel ?? "Remind client"}
            </button>
          )}

          {(phase === "paid_pending" || phase === "paid") && (
            <button type="button" className="fd-btn fd-btn-secondary" disabled={busy} onClick={() => onAction("receipt", vault)}>
              View receipt
            </button>
          )}

          {phase === "payout_failed" && (
            <button type="button" className="fd-btn fd-btn-primary" disabled={busy} onClick={() => onAction("retry", vault)}>
              Retry payout
            </button>
          )}

          {phase === "voided" && (
            <button type="button" className="fd-btn fd-btn-secondary" disabled={busy} onClick={() => onAction("duplicate", vault)}>
              Duplicate vault
            </button>
          )}
        </div>

        {confirm && (
          <div className="fd-confirm-line" aria-live="polite">
            <span className="fd-confirm-fill" aria-hidden="true" />
            <span>{confirm === "submit" ? "Manifest locks on the second click." : "Deletes on the second click."}</span>
          </div>
        )}
      </div>
    </article>
  );
}
