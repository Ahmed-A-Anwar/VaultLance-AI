/* DecisionPanel.tsx — 233px pinned to the bottom of the right column, where the
   money is decided. It shows exactly one thing to do per state, and the hold is
   the shared HoldButton, so approving costs the same deliberate second here as
   it does on the dashboard. */

import { useEffect, useRef, useState } from "react";
import { HoldButton } from "../shared/HoldButton";
import { useToast } from "../shared/Toasts";
import { useRoom } from "./room";
import { Copy, Check } from "./icons";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const FEE = 0.05;

export function DecisionPanel() {
  const { vault, status, busy, authorize, approve, reject, capturedAt } = useRoom();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [counting, setCounting] = useState(0);
  const [holding, setHolding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [anim, setAnim] = useState<"" | "void" | "paid">("");
  const timer = useRef(0);
  const tick = useRef(0);

  const amount = vault?.amountUSD ?? 0;

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

  async function fireApprove() {
    try {
      await approve();
      toast({ message: "Payment captured. Files unlocked.", tone: "success" });
    } catch (e) {
      toast({
        message: e instanceof Error ? e.message : "The capture did not go through.",
        tone: "error",
        action: { label: "Retry", run: () => void fireApprove() },
      });
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

  const copyId = async () => {
    if (!vault?.paypalOrderId) return;
    try {
      await navigator.clipboard.writeText(vault.paypalOrderId);
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
          <button type="button" className="room-primary" onClick={() => void fireAuthorize()} disabled={busy === "authorize"}>
            {busy === "authorize" ? <span className="dash-spin" aria-hidden="true" /> : null}
            {busy === "authorize" ? "Authorizing…" : "Authorize payment"}
          </button>
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

          <HoldButton
            className="room-hold"
            onConfirm={() => void fireApprove()}
            pending={busy === "approve"}
            disabled={status !== "audited" || busy === "reject"}
            label={status === "held" ? "Approve & pay" : "Hold to approve & pay"}
          />
          {status === "held" && <p className="room-hint room-hint-sm">Run the audit first.</p>}

          <button
            type="button"
            className="room-void"
            onClick={armVoid}
            disabled={busy === "approve"}
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
          <p className="room-amount">{usd.format(amount)}</p>
          <p className="room-receipt-line">
            <span>CAPTURE</span>
            <span className="room-mono">{vault?.paypalOrderId ?? "—"}</span>
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
            onClick={() => toast({ message: "Download starts in the real build." })}
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
    </section>
  );
}
