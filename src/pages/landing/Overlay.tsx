import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PrimaryButton } from "../../components/VaultButtons";
import { QrPanel } from "../../components/QrPanel";
import { useMorph } from "../../lib/transitions";
import { ArrowRight, Clock, Cross, Users } from "../../components/icons";
import { SEED } from "../../lib/seed";

/* Section 7's overlay: three paths, SOLO dominant. PayPal login never blocks the demo. */
export function CtaOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { startMorph } = useMorph();
  const card = useRef<HTMLDivElement | null>(null);
  const [showPair, setShowPair] = useState(false);

  useEffect(() => {
    if (!open) return;
    card.current?.querySelector<HTMLElement>("button, [href]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !card.current) return;
      // focus trap: Tab cycles within the dialog
      const focusables = [...card.current.querySelectorAll<HTMLElement>("button, [href], input")]
        .filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const i = focusables.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1)
        : (i === focusables.length - 1 || i === -1 ? 0 : i + 1);
      e.preventDefault();
      focusables[next].focus();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;

  const go = (to: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    startMorph(e.currentTarget, "Vault demo");
    nav(to);
  };
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const token = SEED.vault.token;
  const clientLink = `${base}/v/${token}`;

  return (
    <div className="overlay-backdrop" data-testid="cta-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className="overlay-card" role="dialog" aria-modal="true" aria-labelledby="ov-title">
        <div className="overlay-head">
          <h2 id="ov-title" style={{ fontSize: "1.35rem" }}>Put it to the test</h2>
          <button className="btn ghost" style={{ padding: "6px 10px" }} type="button" onClick={onClose} aria-label="Close demo picker"><Cross /></button>
        </div>
        <p className="small">Nothing below asks for a sign-up. Everything runs against this build's real app with a sandbox transaction, labelled with its real id.</p>
        <div className="paths">
          {/* SOLO — dominant */}
          <div className="path-row" data-primary="true">
            <div className="path">
              <strong>Solo — 60 seconds</strong>
              <span>A pre-loaded vault, live for you now: the sandbox transaction replays with its real id and timestamp, then files unlock.</span>
            </div>
            <PrimaryButton testid="demo-solo" onClick={go(`/demo?vault=${SEED.vault.id}`)}>
              Start demo <ArrowRight />
            </PrimaryButton>
          </div>
          {/* WITH A FRIEND */}
          <div className="path-row">
            <div className="path">
              <strong>With a friend</strong>
              <span>One transaction, two seats: you take the freelancer vault view, your friend scans into the read-only client portal.</span>
            </div>
            <div style={{ display: "grid", gap: 8, justifyItems: "stretch" }}>
              <PrimaryButton testid="demo-friend" onClick={() => setShowPair(true)}>
                <Users /> Set up two seats
              </PrimaryButton>
            </div>
          </div>
          {showPair && (
            <div className="path-row" style={{ gridTemplateColumns: "1fr" }} data-testid="two-seat">
              <div className="sec-grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
                <QrPanel url={clientLink} caption="Friend's seat — the read-only client portal with the HELD amount." />
                <div className="field">
                  <label htmlFor="yourseat">Your seat — the freelancer vault status</label>
                  <input id="yourseat" className="control mono small" readOnly value={`${base}/demo?vault=${SEED.vault.id}`} />
                  <button className="dlbtn" type="button" onClick={() => { startMorph(document.body, "Vault demo"); nav(`/demo?vault=${SEED.vault.id}`); }} data-testid="friend-freelancer">
                    Open my seat now <ArrowRight />
                  </button>
                  <p className="tiny">Share links expire with this sandbox session.</p>
                </div>
              </div>
            </div>
          )}
          {/* LIVE SANDBOX — small, de-emphasised */}
          <p className="link-sandbox" style={{ margin: 0, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Clock style={{ width: 13, height: 13 }} aria-hidden="true" />
            LIVE SANDBOX — wander it: <button className="dlbtn" type="button" onClick={go("/console")}>audit ledger</button> · <button className="dlbtn" type="button" onClick={go("/vault/new")}>seal your own vault</button>. No money moves.
          </p>
        </div>
      </div>
    </div>
  );
}
