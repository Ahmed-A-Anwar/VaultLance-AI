/* AuditRoom.tsx — /vault/:id, the client's side of an escrow. No rail, no
   dashboard chrome: a 55px bar, an 89px phase strip, then the delivery, the
   conversation and the decision, side by side at 0.618 / 1.618 / 1.

   The guard reads the session once. Signed out goes to /signin, a freelancer
   goes back to the dashboard, and an id the mock service does not know gets a
   not-found state with a way back. */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import gsap from "gsap";
import { readSession } from "../../lib/mockAuth";
import { ToastProvider } from "../../components/shared/Toasts";
import { RoomProvider, prefersReduced, useRoom } from "../../components/vault/room";
import { TopBar } from "../../components/vault/TopBar";
import { PhaseStepper } from "../../components/vault/PhaseStepper";
import { FilesPanel } from "../../components/vault/FilesPanel";
import { ChatPanel } from "../../components/vault/ChatPanel";
import { ChecksPanel } from "../../components/vault/ChecksPanel";
import { DecisionPanel } from "../../components/vault/DecisionPanel";
import { HoldButton } from "../../components/shared/HoldButton";
import { ArrowLeft, Download } from "../../components/vault/icons";
import { useToast } from "../../components/shared/Toasts";
import "../../styles/vault.css";

const CODE: Record<string, string> = {
  v_logo_pack: "0001",
  v_booking_app: "0002",
  v_brand_guide: "0003",
  v_landing_page: "0004",
};

const codeFor = (id: string) => CODE[id] ?? id.replace(/[^0-9a-z]/gi, "").slice(-4).toUpperCase();

function Room({ id }: { id: string }) {
  const { detail, vault, status, loading, error, reload } = useRoom();
  const [tab, setTab] = useState<"files" | "chat" | "checks">("chat");
  const root = useRef<HTMLDivElement>(null);
  const entered = useRef(false);

  /* the entrance, once, on the first paint that has data in it */
  useEffect(() => {
    if (loading || !vault || entered.current) return;
    entered.current = true;
    if (prefersReduced()) return;

    const scope = root.current;
    if (!scope) return;
    const q = (name: string) => scope.querySelector(`[data-enter="${name}"]`);
    const ctx = gsap.context(() => {
      gsap.set(q("bar"), { opacity: 0 });
      gsap.set(q("phase"), { opacity: 0, y: 13 });
      gsap.set(q("files"), { opacity: 0, x: -34 });
      gsap.set(q("chat"), { opacity: 0, y: 21 });
      gsap.set(q("checks"), { opacity: 0, x: 34 });
      gsap.set(q("decision"), { opacity: 0, y: 21 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(q("bar"), { opacity: 1, duration: 0.236 }, 0)
        .to(q("phase"), { opacity: 1, y: 0, duration: 0.382 }, 0.236)
        .to(q("files"), { opacity: 1, x: 0, duration: 0.618 }, 0.382)
        .to(q("chat"), { opacity: 1, y: 0, duration: 0.618 }, 0.5)
        .to(q("checks"), { opacity: 1, x: 0, duration: 0.618 }, 0.618)
        .to(q("decision"), { opacity: 1, y: 0, duration: 0.618 }, 0.8);
    }, scope);

    return () => ctx.revert();
  }, [loading, vault]);

  if (error?.kind === "not_found") {
    return (
      <main className="room-state">
        <p className="room-mono">VAULT NOT FOUND</p>
        <h1 className="room-state-h">That vault is not in this sandbox.</h1>
        <p className="room-hint">It may have been opened on another device, or the link is from an older demo.</p>
        <Link to="/dashboard" className="room-back room-back-lg">
          <ArrowLeft width="16" height="16" />
          <span>Back to dashboard</span>
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main className="room-state">
        <p className="room-mono">NO ANSWER</p>
        <h1 className="room-state-h">The vault could not be opened.</h1>
        <p className="room-hint">{error.message}</p>
        <div className="room-state-actions">
          <button type="button" className="room-primary room-primary-sm" onClick={reload}>
            Retry
          </button>
          <Link to="/dashboard" className="room-back">
            <ArrowLeft width="16" height="16" />
            <span>Back to dashboard</span>
          </Link>
        </div>
      </main>
    );
  }

  if (loading || !vault || !status) return <RoomSkeleton />;

  return (
    <div className="room" ref={root}>
      <a className="room-skip" href="#room-chat-h">
        Skip to the audit chat
      </a>

      <TopBar
        project={vault.project}
        freelancer={vault.freelancer}
        status={status}
        code={codeFor(id)}
      />

      <PhaseStepper status={status} />

      {status === "voided" && <span className="room-ribbon">VOIDED</span>}

      <div className="room-tabs" role="tablist" aria-label="Room sections">
        {(["files", "chat", "checks"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="room-tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {key === "files" ? "Files" : key === "chat" ? "Chat" : "Checks"}
          </button>
        ))}
      </div>

      <main className="room-main" data-tab={tab}>
        <FilesPanel />
        <ChatPanel />
        <div className="room-side">
          <ChecksPanel />
          <DecisionPanel />
        </div>
      </main>

      <MobileDecision tab={tab} setTab={setTab} />

      {detail && <span className="dash-sr" aria-live="polite">{`${vault.project}, ${status.replace("_", " ")}`}</span>}
    </div>
  );
}

/* the phone's always-visible decision bar: the same actions, one line high */
function MobileDecision({
  tab,
  setTab,
}: {
  tab: "files" | "chat" | "checks";
  setTab: (t: "files" | "chat" | "checks") => void;
}) {
  const { vault, status, busy, authorize, approve } = useRoom();
  const toast = useToast();
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (!vault || !status) return null;

  return (
    <aside className="room-mobile-decision" aria-label="Decision">
      <div className="room-mobile-amount">
        <span className="room-mono">{status === "unlocked" ? "PAID" : status === "voided" ? "VOIDED" : "HELD"}</span>
        <strong className="room-mobile-figure">{usd.format(vault.amountUSD)}</strong>
      </div>

      {status === "awaiting_payment" && (
        <button
          type="button"
          className="room-primary room-primary-sm"
          disabled={busy === "authorize"}
          onClick={async () => {
            try {
              await authorize();
              toast({ message: "Payment authorized. Funds held.", tone: "success" });
            } catch (e) {
              toast({ message: e instanceof Error ? e.message : "The authorization did not go through.", tone: "error" });
            }
          }}
        >
          {busy === "authorize" ? "Authorizing…" : "Authorize payment"}
        </button>
      )}

      {status === "held" && (
        <button type="button" className="room-run" onClick={() => setTab("checks")}>
          {tab === "checks" ? "Run the checks" : "Open the checks"}
        </button>
      )}

      {status === "audited" && (
        <HoldButton
          className="room-hold room-hold-sm"
          label="Hold to approve"
          onConfirm={() => void approve()}
          pending={busy === "approve"}
        />
      )}

      {status === "unlocked" && (
        <button
          type="button"
          className="room-primary room-primary-sm"
          onClick={() => toast({ message: "Download starts in the real build." })}
        >
          <Download width="14" height="14" /> Download all
        </button>
      )}
    </aside>
  );
}

function RoomSkeleton() {
  return (
    <div className="room" aria-busy="true" aria-label="Opening the vault">
      <header className="room-bar">
        <span className="room-skel room-skel-back" />
        <span className="room-skel room-skel-title" />
        <span className="room-skel room-skel-chip" />
      </header>
      <div className="room-phase">
        <div className="room-steps room-steps-skel">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="room-step">
              <span className="room-skel room-skel-node" />
              <span className="room-skel room-skel-label" />
            </span>
          ))}
        </div>
      </div>
      <div className="room-main">
        <div className="room-panel room-files">
          <span className="room-skel room-skel-figure" />
          <span className="room-skel room-skel-h" />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="room-skel room-skel-row" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
        <div className="room-panel room-chat">
          <span className="room-skel room-skel-h" />
          <span className="room-skel room-skel-bubble" />
          <span className="room-skel room-skel-bubble room-skel-bubble-sm" />
          <span className="room-skel room-skel-composer" />
        </div>
        <div className="room-side">
          <div className="room-panel room-checks">
            <span className="room-skel room-skel-h" />
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="room-skel room-skel-check" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          <div className="room-panel room-decision" />
        </div>
      </div>
    </div>
  );
}

export default function AuditRoom() {
  const { id = "" } = useParams();
  const session = useMemo(() => readSession(), []);

  if (!session) return <Navigate to="/signin" replace />;
  if (session.role === "freelancer") return <Navigate to="/dashboard" replace />;

  return (
    <ToastProvider>
      <RoomProvider id={id}>
        <Room id={id} />
      </RoomProvider>
    </ToastProvider>
  );
}
