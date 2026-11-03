/* VaultCard.tsx — one vault, 144px, two columns. The left says what it is and
   where the money has got to; the right says what the freelancer should do next.

   Every phase has its own hint and its own actions, and the actions run through
   the provider's `perform`, so a failure always surfaces as a toast with a retry
   instead of a dead button. Two-step actions put the state in the label —
   "Confirm submit" — and count down in a live region, never in colour alone. */

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Copy, Wheel } from "../dashboard/icons";
import { PhaseChip } from "./PhaseChip";
import { FreelancerStepper } from "./FreelancerStepper";
import { useFreelancerData } from "./FreelancerData";
import { useToast } from "../shared/Toasts";
import { formatCents } from "../../lib/fees";
import { phaseOfVault } from "./mockApi";
import type { Phase } from "../../lib/freelancerPhase";
import {
  deleteDraft,
  duplicateVault,
  inviteLink,
  remindClient,
  retryPayout,
  submitForReview,
  type FreelancerVault,
} from "./mockApi";

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

export function VaultCard({
  vault,
  onOpen,
}: {
  vault: FreelancerVault;
  onOpen: (kind: "new" | "files" | "details", vault?: FreelancerVault) => void;
}) {
  const { perform } = useFreelancerData();
  const toast = useToast();
  const phase = phaseOfVault(vault);

  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "submit" | "delete"; left: number } | null>(null);

  useEffect(() => {
    if (!confirm) return;
    if (confirm.left <= 0) {
      setConfirm(null);
      return;
    }
    const timer = window.setTimeout(
      () => setConfirm((c) => (c ? { ...c, left: c.left - 1 } : null)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [confirm]);

  const act = async (key: string, run: () => Promise<unknown>, ok: string) => {
    setPending(key);
    await perform(run, ok);
    setPending(null);
  };

  const twoStep = (kind: "submit" | "delete", run: () => Promise<unknown>, ok: string) => {
    if (confirm?.kind === kind) {
      setConfirm(null);
      void act(kind, run, ok);
      return;
    }
    setConfirm({ kind, left: 3 });
  };

  const copyInvite = () => {
    if (!vault.inviteCode) return;
    void navigator.clipboard?.writeText(inviteLink(vault.inviteCode)).catch(() => {});
    toast({ message: "Invite link copied.", tone: "info" });
  };

  const cooldownH = vault.lastRemindedAt
    ? Math.max(0, 24 - Math.floor((Date.now() - vault.lastRemindedAt) / 3_600_000))
    : 0;

  const remind = (
    <button
      type="button"
      className="fd-btn fd-btn-ghost"
      disabled={pending !== null || cooldownH > 0}
      onClick={() => void act("remind", () => remindClient(vault.id), "Reminder sent.")}
    >
      {pending === "remind" ? "Sending…" : cooldownH > 0 ? `REMIND IN ${cooldownH}H` : "Remind client"}
    </button>
  );

  const actions = () => {
    switch (phase) {
      case "draft":
        return (
          <>
            <button type="button" className="fd-btn fd-btn-primary" onClick={() => onOpen("new", vault)}>
              Continue setup
            </button>
            <button
              type="button"
              className="fd-btn fd-btn-ghost-danger"
              disabled={pending !== null}
              onClick={() => twoStep("delete", () => deleteDraft(vault.id), "Draft deleted.")}
            >
              {confirm?.kind === "delete" ? "Confirm delete" : "Delete draft"}
            </button>
          </>
        );
      case "invited":
        return (
          <>
            <button type="button" className="fd-btn fd-btn-soft" onClick={copyInvite}>
              <Copy width="13" height="13" /> Copy invite link
            </button>
            {remind}
          </>
        );
      case "funded":
        return (
          <>
            {vault.filesCount === 0 ? (
              <button type="button" className="fd-btn fd-btn-primary" onClick={() => onOpen("files", vault)}>
                Upload files
              </button>
            ) : (
              <button
                type="button"
                className="fd-btn fd-btn-primary"
                disabled={pending !== null}
                aria-live="polite"
                onClick={() => twoStep("submit", () => submitForReview(vault.id), "Submitted. Your manifest is locked.")}
              >
                {confirm?.kind === "submit" ? "Confirm submit" : "Submit for review"}
              </button>
            )}
            <button type="button" className="fd-btn fd-btn-soft" onClick={() => onOpen("files", vault)}>
              Add files
            </button>
          </>
        );
      case "submitted":
        return remind;
      case "in_review":
        return <span className="fd-wait">No action needed</span>;
      case "paid_pending":
      case "paid":
        return (
          <button type="button" className="fd-btn fd-btn-soft" onClick={() => onOpen("details", vault)}>
            View receipt
          </button>
        );
      case "payout_failed":
        return (
          <button
            type="button"
            className="fd-btn fd-btn-primary"
            disabled={pending !== null}
            onClick={() => void act("retry", () => retryPayout(vault.id), "Payout sent.")}
          >
            {pending === "retry" ? "Retrying…" : "Retry payout"}
          </button>
        );
      case "voided":
        return (
          <button
            type="button"
            className="fd-btn fd-btn-soft"
            disabled={pending !== null}
            onClick={() => void act("dup", () => duplicateVault(vault.id), "Vault duplicated.")}
          >
            Duplicate vault
          </button>
        );
    }
  };

  return (
    <article
      className="fd-card"
      data-phase={phase}
      data-dim={phase === "voided" ? "true" : undefined}
      aria-label={`${vault.project}, ${phase.replace("_", " ")}`}
    >
      <div className="fd-card-main">
        <div className="fd-card-top">
          <h3 className="fd-card-title">{vault.project}</h3>
          <PhaseChip phase={phase} />
        </div>

        <p className="fd-card-meta">
          <span>{vault.clientName}</span>
          <span className="fd-card-dot" aria-hidden="true" />
          <span className="fd-card-amount">{formatCents(vault.amountCents)}</span>
        </p>

        <FreelancerStepper phase={phase} />
      </div>

      <div className="fd-card-side">
        <button
          type="button"
          className="fd-info"
          aria-label={`Details for ${vault.project}`}
          onClick={() => onOpen("details", vault)}
        >
          <Wheel width="15" height="15" />
        </button>

        <p className="fd-card-hint">{HINT[phase]}</p>

        <div className="fd-card-actions">
          {pending ? <span className="fd-spin" aria-hidden="true" /> : null}
          {actions()}
        </div>

        {confirm && (
          <p className="fd-confirm-line" aria-live="polite">
            {confirm.kind === "submit" ? "Confirm submit" : "Confirm delete"} in {confirm.left}s
            <span className="fd-confirm-bar" style={{ "--left": confirm.left } as CSSProperties} />
          </p>
        )}
      </div>
    </article>
  );
}
