/* VaultList.tsx — the lower band's left column: the decision queue. Sorted so
   the vault that needs a decision comes first, filtered by the strip's search
   and the chip row, and re-sorted with a FLIP so a card never teleports. */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { VaultStatus } from "../../lib/api";
import { useDashData } from "./data";
import { VaultCard } from "./VaultCard";
import { JoinRow } from "./JoinRow";
import { useDashUi } from "./ui";

type Filter = "all" | Extract<VaultStatus, "held" | "audited" | "unlocked">;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "held", label: "Held" },
  { key: "audited", label: "Audited" },
  { key: "unlocked", label: "Unlocked" },
];

/* what needs the client first, then what is waiting, then what is done */
const RANK: Record<VaultStatus, number> = {
  audited: 0,
  held: 1,
  awaiting_payment: 2,
  unlocked: 3,
  voided: 4,
};

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function VaultList({ heading = "h2" }: { heading?: "h1" | "h2" }) {
  const { vaults, loading, error, reload } = useDashData();
  const { query, joinOpen, setJoinOpen } = useDashUi();
  const [filter, setFilter] = useState<Filter>("all");

  const nodes = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, DOMRect>());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vaults
      .filter((v) => (filter === "all" ? true : v.status === filter))
      .filter((v) => !q || v.project.toLowerCase().includes(q) || v.freelancer.toLowerCase().includes(q))
      .sort((a, b) => RANK[a.status] - RANK[b.status] || b.createdAt - a.createdAt);
  }, [vaults, filter, query]);

  /* FLIP: measure where each card is now, compare with where it was, and slide
     it from the old spot. Runs after every commit, animates only what moved. */
  useLayoutEffect(() => {
    if (reduceMotion()) {
      positions.current.clear();
      return;
    }
    const next = new Map<string, DOMRect>();
    nodes.current.forEach((el, id) => {
      const now = el.getBoundingClientRect();
      next.set(id, now);
      const before = positions.current.get(id);
      if (!before) return;
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: 618, easing: "cubic-bezier(0.215, 0.61, 0.355, 1)" }
      );
    });
    positions.current = next;
  });

  const empty = !loading && !error && vaults.length === 0;
  const Heading = heading;

  return (
    <section className="dash-vaults" aria-labelledby="dash-vaults-h">
      <div className="dash-vaults-head">
        <Heading id="dash-vaults-h" className="dash-section-h">
          Needs your decision
        </Heading>
        <div className="dash-chips" role="group" aria-label="Filter vaults">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="dash-chip-filter"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* phones get the join action here, at the top of the list */}
      <button type="button" className="dash-btn dash-btn-primary dash-join-cta" onClick={() => setJoinOpen(true)}>
        <span className="dash-btn-label">Join a vault</span>
      </button>

      {(joinOpen || empty) && <JoinRow onDone={() => setJoinOpen(false)} />}

      {loading && vaults.length === 0 && (
        <div className="dash-vault-list" aria-busy="true" aria-label="Loading vaults">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dash-vault is-skeleton" style={{ animationDelay: `${i * 0.0618}s` }}>
              <span className="dash-skel dash-skel-title" />
              <span className="dash-skel dash-skel-line" />
              <span className="dash-skel dash-skel-step" />
            </div>
          ))}
        </div>
      )}

      {error && vaults.length === 0 && !loading && (
        <div className="dash-error" role="alert">
          <p className="dash-error-h">Could not load your vaults.</p>
          <p className="dash-mono dim">{error.message}</p>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={reload}>
            <span className="dash-btn-label">Retry</span>
          </button>
        </div>
      )}

      {empty && (
        <div className="dash-empty">
          <img className="dash-empty-img" src="/vault-frames/f_001.webp" alt="" width={233} height={233} />
          <p className="dash-empty-h">No vaults yet. Join one with a code.</p>
        </div>
      )}

      {!empty && (
        <div className="dash-vault-list">
          {visible.map((v, i) => (
            <VaultCard
              key={v.id}
              vault={v}
              index={i}
              cardRef={(el) => {
                if (el) nodes.current.set(v.id, el);
                else nodes.current.delete(v.id);
              }}
            />
          ))}
          {visible.length === 0 && !loading && (
            <p className="dash-mono dim dash-vault-list-empty">Nothing matches this view.</p>
          )}
        </div>
      )}
    </section>
  );
}
