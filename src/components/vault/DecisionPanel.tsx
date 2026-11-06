/* DecisionPanel.tsx — 233px pinned to the bottom of the right column, where the
   money is decided. It shows exactly one thing to do per state, and the hold is
   the shared HoldButton, so approving costs the same deliberate second here as
   it does on the dashboard.

   When checks failed, approval needs the client to look at each failure: the
   review dialog lists them unchecked, and only a full tick + hold captures. The
   server checks the same list against its stored report. */

import { useEffect, useRef, useState } from "react";
import { HoldButton } from "../shared/HoldButton";
import { PayPalAuthorizeButton } from "../shared/PayPalAuthorizeButton";
import { useToast } from "../shared/Toasts";
import { useRoom } from "./room";
import { downloadVaultFile, type WaiverRequest } from "../../lib/api";
import { mockHoldAllowed } from "../../lib/apiClient";
import { Copy, Check } from "./icons";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const FEE = 0.05;

export function DecisionPanel() {
  const {
    vault,
    status,
    busy,
    authorize,
    approve,
    requestRevision,
    reject,
    capturedAt,
    reload,
    failedChecks,
    waivedChecks,
    revisionNote,
    detail,
  } = useRoom();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [counting, setCounting] = useState(0);
  const [holding, setHolding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [revision, setRevision] = useState(false);
  const [anim, setAnim] = useState<"" | "void" | "paid">("");
  const timer = useRef(0);
  const tick = useRef(0);

  const amount = vault?.amountUSD ?? 0;
  const hasFailedChecks = failedChecks.length > 0;

  useEffect(() => {
    if (status === "voided") setAnim("void");
    if (status === "unlocked") setAnim("paid");
  }, [status]);

  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
      window.clearInterval(tick.current);
    };
  }, []);

  const armVoid = () => {
    if (confirming) {
      window.clearTimeout(timer.current);
      window.clearInterval(tick.current);
      setConfirming(false);
      void fireReject();
      return;
    }
    setConfirming(true);
    setCounting(100);
    const startedAt = Date.now();
    tick.current = window.setInterval(() => {
      const left = Math.max(0, 100 - ((Date.now() - startedAt) / 3000) * 100);
      setCounting(left);
    }, 42);
    timer.current = window.setTimeout(() => {
      setConfirming(false);
      window.clearInterval(tick.current);
      setCounting(0);
    }, 3000);
  };

  async function fireAuthorize() {
    try {
      await authorize();
      toast({ message: "Payment authorized. Funds held.", tone: "success" });
    } catch (e) {
      toast({
        message: e instanceof Error ? e.message : "The authorization did not go through.",
        tone: "error",
        action: { label: "Retry", run: () => void fireAuthorize() },
      });
    }
  }

  const openReview = () => {
    setSelected([]);
    setNote("");
    setReviewing(true);
  };

  const toggleCheck = (checkId: string) =>
    setSelected((prev) => (prev.includes(checkId) ? prev.filter((id) => id !== checkId) : [...prev, checkId]));

  const waiversFor = (ids: string[]): WaiverRequest[] =>
    failedChecks
      .filter((check) => ids.includes(check.id))
      .map((check) => ({ checkId: check.id, ...(note.trim() ? { reason: note.trim() } : {}) }));

  async function fireApprove(waivers: WaiverRequest[]) {
    try {
      await approve(waivers);
      setReviewing(false);
      toast({ message: "Payment captured. Files unlocked.", tone: "success" });
    } catch (e) {
      toast({
        message: e instanceof Error ? e.message : "The capture did not go through.",
        tone: "error",
        action: { label: "Retry", run: () => void fireApprove(waivers) },
      });
    }
  }

  async function fireRevision() {
    setRevision(true);
    try {
      await requestRevision(note.trim() || undefined);
      setReviewing(false);
      toast({ message: "Revision requested. The freelancer can resubmit.", tone: "info" });
    } catch (e) {
      toast({
        message: e instanceof Error ? e.message : "The revision was not requested.",
        tone: "error",
        action: { label: "Retry", run: () => void fireRevision() },
      });
    } finally {
      setRevision(false);
    }
  }

  async function fireReject() {
    try {
      await reject();
      toast({ message: "Hold voided. Funds returned.", tone: "info" });
    } catch (e) {
      toast({
        message: e instanceof Error ? e.message : "The hold was not voided.",
        tone: "error",
        action: { label: "Retry", run: () => void fireReject() },
      });
    }
  }

  const download = async () => {
    const files = (detail?.files ?? []).filter((f) => f.kind === "file");
    if (!files.length) {
      toast({ message: "This delivery has no files to download yet.", tone: "info" });
      return;
    }
    try {
      for (const file of files) await downloadVaultFile(file.id, file.name);
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "The files could not be downloaded.", tone: "error" });
    }
  };

  /* a paid vault is identified by its capture, not by the order it came from */
  const receiptId = vault?.captureId ?? vault?.paypalOrderId;

  const copyId = async () => {
    if (!receiptId) return;
    try {
      await navigator.clipboard.writeText(receiptId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      toast({ message: "Could not copy the capture id.", tone: "error" });
    }
  };

  return (
    <section
      className="room-panel room-decision"
      aria-labelledby="room-decision-h"
      data-enter="decision"
      data-holding={holding ? "true" : undefined}
      data-anim={anim || undefined}
      onPointerDown={() => status === "audited" && setHolding(true)}
      onPointerUp={() => setHolding(false)}
      onPointerLeave={() => setHolding(false)}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && status === "audited") setHolding(true);
      }}
      onKeyUp={() => setHolding(false)}
    >
      <h2 id="room-decision-h" className="room-mono room-decision-h">
        DECISION
      </h2>

      {status === "awaiting_payment" && (
        <>
          <p className="room-amount">{usd.format(amount)}</p>
          <p className="room-hint">Nothing is spent. PayPal holds the amount until you decide.</p>
          {vault?.id && (
            <PayPalAuthorizeButton
              vaultId={vault.id}
              amountUSD={amount}
              onSuccess={() => {
                void reload();
              }}
            />
          )}
          {/* the mock hold moves no money, so a build with an API reaches it
              through the PayPal button above and nothing else */}
          {mockHoldAllowed() && (
            <button type="button" className="room-primary" onClick={() => void fireAuthorize()} disabled={busy === "authorize"}>
              {busy === "authorize" ? <span className="dash-spin" aria-hidden="true" /> : null}
              {busy === "authorize" ? "Authorizing…" : "Authorize payment"}
            </button>
          )}
        </>
      )}

      {(status === "held" || status === "audited") && (
        <>
          <div className="room-decision-row">
            <p className="room-amount">{usd.format(amount)}</p>
            <dl className="room-fees">
              <div>
                <dt>AMOUNT</dt>
                <dd>{usd.format(amount)}</dd>
              </div>
              <div>
                <dt>FEE 5%</dt>
                <dd>{usd.format(Math.round(amount * FEE))}</dd>
              </div>
              <div>
                <dt>FREELANCER</dt>
                <dd>{usd.format(Math.round(amount * (1 - FEE)))}</dd>
              </div>
            </dl>
          </div>

          {status === "audited" && hasFailedChecks ? (
            <>
              <button
                type="button"
                className="room-primary"
                onClick={openReview}
                disabled={busy === "reject" || busy === "revision"}
                onPointerDown={(e) => e.stopPropagation()}
              >
                Review failed checks ({failedChecks.length})
              </button>
              <p className="room-hint room-hint-sm">
                Payment is locked while checks failed. Waive them to pay, or ask for a revision.
              </p>
              <button
                type="button"
                className="room-void"
                onClick={() => void fireRevision()}
                disabled={busy === "approve" || busy === "revision" || revision}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {revision ? "Requesting…" : "Request a revision"}
              </button>
            </>
          ) : (
            <>
              <HoldButton
                className="room-hold"
                onConfirm={() => void fireApprove([])}
                pending={busy === "approve"}
                disabled={status !== "audited" || busy === "reject"}
                label={status === "held" ? "Approve & pay" : "Hold to approve & pay"}
              />
              {status === "held" && <p className="room-hint room-hint-sm">Run the audit first.</p>}
            </>
          )}

          <button
            type="button"
            className="room-void"
            onClick={armVoid}
            disabled={busy === "approve" || busy === "revision"}
            onMouseDown={(e) => e.stopPropagation()}
            aria-describedby={confirming ? "room-void-bar" : undefined}
          >
            {confirming ? "Confirm void" : "Reject & void"}
            {confirming && (
              <span id="room-void-bar" className="room-void-bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${counting / 100})` }} />
              </span>
            )}
          </button>
        </>
      )}

      {status === "unlocked" && (
        <div className="room-receipt">
          <p className="room-paid">PAID</p>
          {waivedChecks.length > 0 && (
            <p className="room-waived-line">
              <span className="dash-chip" data-status="waived">
                WAIVED {waivedChecks.length}
              </span>
              <span className="room-hint room-hint-sm">
                {waivedChecks.map((waiver) => waiver.name).join(", ")} — approved by the client.
              </span>
            </p>
          )}
          <p className="room-amount">{usd.format(amount)}</p>
          <p className="room-receipt-line">
            <span>CAPTURE</span>
            <span className="room-mono">{receiptId ?? "—"}</span>
            <button type="button" className="room-copy-id" onClick={() => void copyId()} aria-label="Copy the capture id">
              {copied ? <Check width="13" height="13" /> : <Copy width="13" height="13" />}
            </button>
          </p>
          <p className="room-receipt-line">
            <span>WHEN</span>
            <span className="room-mono">
              {new Date(capturedAt ?? Date.now()).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
          <button
            type="button"
            className="room-download-all room-download-sm"
            onClick={() => void download()}
          >
            Download all
          </button>
        </div>
      )}

      {status === "voided" && (
        <div className="room-voided">
          <p className="room-voided-h">HOLD VOIDED</p>
          <p className="room-hint">Funds returned. Nothing was charged.</p>
        </div>
      )}

      {reviewing && status === "audited" && hasFailedChecks && (
        <div className="room-review-overlay" role="dialog" aria-modal="true" aria-labelledby="room-review-h">
          <div className="room-review" onPointerDown={(e) => e.stopPropagation()}>
            <h3 id="room-review-h" className="room-review-h">
              Review failed checks
            </h3>
            <p className="room-hint room-hint-sm">
              Tick every failed check you accept, then hold to capture payment. The server records
              each waiver with your note.
            </p>
            <ul className="room-review-list">
              {failedChecks.map((check) => (
                <li key={check.id}>
                  <label className="room-review-check">
                    <input
                      type="checkbox"
                      checked={selected.includes(check.id)}
                      onChange={() => toggleCheck(check.id)}
                    />
                    <span>
                      <strong>{check.name}</strong>
                      {check.detail ? <small>{check.detail}</small> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <label className="room-review-note">
              <span>Note (optional)</span>
              <textarea
                value={note}
                maxLength={500}
                rows={2}
                placeholder="Why are these acceptable?"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <HoldButton
              className="room-hold"
              onConfirm={() => void fireApprove(waiversFor(selected))}
              pending={busy === "approve"}
              disabled={selected.length !== failedChecks.length}
              label="Hold to waive and approve"
            />
            <div className="room-review-actions">
              <button
                type="button"
                className="room-review-cancel"
                onClick={() => setReviewing(false)}
                disabled={busy === "approve"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="room-review-revision"
                onClick={() => void fireRevision()}
                disabled={busy === "approve" || busy === "revision" || revision}
              >
                {revision ? "Requesting…" : "Request a revision"}
              </button>
            </div>
          </div>
        </div>
      )}

      {status === "audited" && revisionNote && !hasFailedChecks && (
        <p className="room-hint room-hint-sm">Revision requested: {revisionNote}</p>
      )}
    </section>
  );
}
