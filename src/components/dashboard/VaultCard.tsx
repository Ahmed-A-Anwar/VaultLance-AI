/* VaultCard.tsx — one vault, one decision. The card states where the money is
   (chip + stepper) and offers the single next action: authorize, audit, approve
   and pay (hold), download, or nothing at all when the hold was voided. */

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  approveVault,
  auditVault,
  authorizeVault,
  markAudited,
  rejectVault,
  type Vault,
  type VaultStatus,
} from "../../lib/api";
import { HoldButton } from "../shared/HoldButton";
import { StatusChip } from "../shared/StatusChip";
import { Stepper } from "./Stepper";
import { PadlockOpen, Wheel } from "./icons";
import { useDashData } from "./data";
import { useToast } from "../shared/Toasts";

const CHIP: Record<VaultStatus, string> = {
  awaiting_payment: "awaiting payment",
  held: "held",
  audited: "audited",
  unlocked: "unlocked",
  voided: "voided",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type Busy = null | "authorize" | "audit" | "approve" | "reject";

export function VaultCard({
  vault,
  index = 0,
  cardRef,
}: {
  vault: Vault;
  index?: number;
  cardRef?: (el: HTMLElement | null) => void;
}) {
  const { putVault } = useDashData();
  const toast = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  const [rejectHover, setRejectHover] = useState(false);
  const [anim, setAnim] = useState<"" | "unlock" | "void">("");
  const previous = useRef<VaultStatus>(vault.status);

  /* the moment a card changes state, say so with motion (CSS) once */
  useEffect(() => {
    const from = previous.current;
    if (from === vault.status) return;
    previous.current = vault.status;
    if (vault.status === "unlocked") setAnim("unlock");
    if (vault.status === "voided") setAnim("void");
    const timer = window.setTimeout(() => setAnim(""), 900);
    return () => window.clearTimeout(timer);
  }, [vault.status]);

  const fail = (e: unknown) => {
    const message = e instanceof ApiError ? e.message : "Something went wrong.";
    toast({ message, tone: "error", action: { label: "Retry", run: () => void act(lastAction.current) } });
  };

  const lastAction = useRef<Busy>(null);

  async function act(kind: Busy) {
    if (!kind) return;
    lastAction.current = kind;
    setBusy(kind);
    try {
      if (kind === "authorize") {
        const next = await authorizeVault(vault.id);
        putVault(next);
        toast({ message: `${next.project}: ${usd.format(next.amountUSD)} is held.`, tone: "success" });
      } else if (kind === "audit") {
        /* The audit itself lives in the playground, which is outside this
           build. The API still returns its route; with no route to visit the
           card runs the audit dev-helper so the demo reaches the decision. */
        await auditVault(vault.id);
        const next = await markAudited(vault.id);
        putVault(next);
        toast({ message: "Audit finished. It is ready for your decision.", tone: "success" });
      } else if (kind === "approve") {
        /* the ledger raises the toast for the capture, so it is not said twice */
        putVault(await approveVault(vault.id));
      } else if (kind === "reject") {
        const next = await rejectVault(vault.id);
        putVault(next);
        toast({ message: `${next.project}: hold voided. Nothing was charged.`, tone: "info" });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const blocked = busy !== null;
  const spinner = <span className="dash-spin" aria-hidden="true" />;

  return (
    <article
      ref={cardRef}
      className="dash-vault"
      data-status={vault.status}
      data-anim={anim || undefined}
      data-enter="vault"
      style={{ animationDelay: `${236 + index * 61.8}ms` }}
      aria-label={`${vault.project} with ${vault.freelancer}, ${usd.format(vault.amountUSD)}, ${CHIP[
        vault.status
      ].toLowerCase()}`}
    >
      <div className="dash-vault-main">
        <div className="dash-vault-head">
          <h3 className="dash-vault-project">{vault.project}</h3>
          <StatusChip key={vault.status} status={vault.status} />
        </div>

        <p className="dash-vault-freelancer">
          {vault.freelancer} <span className="dim">·</span>{" "}
          <span className="dash-vault-amt">{usd.format(vault.amountUSD)}</span>
        </p>

        <Stepper status={vault.status} />
      </div>

      <div className="dash-vault-side">
        {vault.status === "unlocked" ? (
          <PadlockOpen className="dash-vault-wheel" data-open="true" width="21" height="21" />
        ) : (
          <Wheel className="dash-vault-wheel" width="21" height="21" />
        )}

        <div className="dash-vault-actions">
          {vault.status === "awaiting_payment" && (
            <button
              type="button"
              className="dash-btn dash-btn-primary"
              onClick={() => void act("authorize")}
              disabled={blocked}
            >
              <span className="dash-btn-label">{busy === "authorize" ? "Authorizing…" : "Authorize payment"}</span>
              {busy === "authorize" ? spinner : <span className="dash-btn-arrow" aria-hidden="true">→</span>}
            </button>
          )}

          {vault.status === "held" && (
            <div className="dash-vault-approve">
              <button type="button" className="dash-btn dash-btn-primary" onClick={() => void act("audit")} disabled={blocked}>
                <span className="dash-btn-label">{busy === "audit" ? "Auditing…" : "Audit now"}</span>
                {busy === "audit" ? spinner : <span className="dash-btn-arrow" aria-hidden="true">→</span>}
              </button>
              {/* a hold can be voided before it is audited, too */}
              <button
                type="button"
                className="dash-btn dash-btn-danger"
                onClick={() => void act("reject")}
                disabled={blocked}
                onMouseEnter={() => setRejectHover(true)}
                onMouseLeave={() => setRejectHover(false)}
                onFocus={() => setRejectHover(true)}
                onBlur={() => setRejectHover(false)}
              >
                {busy === "reject" ? spinner : <span className="dash-btn-label">{rejectHover ? "Void the hold" : "Reject & void"}</span>}
              </button>
            </div>
          )}

          {vault.status === "audited" && (
            <div className="dash-vault-approve">
              <HoldButton
                onConfirm={() => void act("approve")}
                pending={busy === "approve"}
                disabled={blocked && busy !== "approve"}
              />
              <button
                type="button"
                className="dash-btn dash-btn-danger"
                onClick={() => void act("reject")}
                disabled={blocked}
                onMouseEnter={() => setRejectHover(true)}
                onMouseLeave={() => setRejectHover(false)}
                onFocus={() => setRejectHover(true)}
                onBlur={() => setRejectHover(false)}
              >
                {busy === "reject" ? spinner : <span className="dash-btn-label">{rejectHover ? "Void the hold" : "Reject & void"}</span>}
              </button>
            </div>
          )}

          {vault.status === "unlocked" && (
            <button
              type="button"
              className="dash-btn dash-btn-ghost"
              onClick={() => toast({ message: "Download starts in the real build." })}
            >
              <span className="dash-btn-label">Download</span>
            </button>
          )}

          {vault.status === "voided" && <p className="dash-vault-void">Hold voided</p>}
        </div>
      </div>

      <span className="dash-vault-sweep" aria-hidden="true" />
    </article>
  );
}
