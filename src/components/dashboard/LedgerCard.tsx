/* LedgerCard.tsx — the lower band's right column: the ledger grid inside the
   glass card, with the toast the spec asks for on a capture, and a disclosure
   on phones so the activity does not push the cards off the screen. */

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "./icons";
import { LedgerGrid } from "./LedgerGrid";
import { useDashData } from "./data";
import { useToast } from "./Toasts";

export function LedgerCard({ full = false, heading = "h2" }: { full?: boolean; heading?: "h1" | "h2" }) {
  const { events, vaults, loading, error, reload, latestEvent } = useDashData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const said = useRef<{ type: string; at: number } | null>(null);

  useEffect(() => {
    if (!latestEvent) return;
    if (latestEvent.type !== "PAYMENT.CAPTURED" && latestEvent.type !== "FILES.UNLOCKED") return;

    /* a capture emits two events back to back: say the sentence once */
    const now = Date.now();
    const prev = said.current;
    if (prev && prev.type !== latestEvent.type && now - prev.at < 1200) {
      said.current = { type: latestEvent.type, at: prev.at };
      return;
    }
    said.current = { type: latestEvent.type, at: now };
    toast({ message: "Payment captured. Files unlocked.", tone: "success" });
  }, [latestEvent, toast]);

  const Heading = heading;

  return (
    <section className="dash-ledger" data-open={open} aria-labelledby="dash-ledger-h" data-enter="ledger">
      <div className="dash-ledger-head">
        <Heading id="dash-ledger-h" className="dash-section-h">
          Ledger
        </Heading>
        <button
          type="button"
          className="dash-ledger-toggle"
          aria-expanded={open}
          aria-controls="dash-ledger-body"
          onClick={() => setOpen((v) => !v)}
        >
          Recent activity
          <ChevronDown width="14" height="14" aria-hidden="true" />
        </button>
      </div>

      <div id="dash-ledger-body" className="dash-ledger-body-wrap">
        {loading && events.length === 0 && (
          <div className="dash-ledger-skel" aria-busy="true" aria-label="Loading activity">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="dash-skel dash-skel-row" />
            ))}
          </div>
        )}

        {error && events.length === 0 && !loading && (
          <div className="dash-error" role="alert">
            <p className="dash-error-h">Could not load the ledger.</p>
            <button type="button" className="dash-btn dash-btn-ghost" onClick={reload}>
              <span className="dash-btn-label">Retry</span>
            </button>
          </div>
        )}

        {!loading && events.length > 0 && <LedgerGrid full={full} events={events} vaults={vaults} />}
        {!loading && events.length === 0 && <p className="dash-grid-empty">No events yet.</p>}
      </div>
    </section>
  );
}
