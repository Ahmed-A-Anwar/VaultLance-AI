import { useMemo, useState } from "react";import { Link } from "react-router-dom";
import { useStore, type LedgerRow } from "../lib/store";
import { Clock, File, Scan } from "../components/icons";
import { stamp } from "../lib/money";
import { useReveal } from "./landing/sections";

const SRC_ICONS = { scan: Scan, clock: Clock, file: File } as const;
const srcIcon = (src: string) => (src in SRC_ICONS ? SRC_ICONS[src as keyof typeof SRC_ICONS] : Clock);

const FILTERS = ["All", "Live only", "COMPUTED", "JUDGED"] as const;

/* /console — the audit ledger: dense, grouped, live */
export default function Console() {
  const { ledger, vaults } = useStore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [q, setQ] = useState("");
  const { ref, at } = useReveal();

  const grouped = useMemo(() => {
    let rows: LedgerRow[] = [...ledger];
    if (filter === "Live only") rows = rows.filter((e) => Date.now() - e.at < 60_000);
    if (filter === "COMPUTED") rows = rows.filter((e) => Boolean(e.computed));
    if (filter === "JUDGED") rows = rows.filter((e) => Boolean(e.judged));
    if (q.trim()) rows = rows.filter((e) =>
      [e.src, e.computed, e.judged ?? "", String(e.state)].join(" ").toLowerCase().includes(q.toLowerCase()));
    const byVault = new Map<string, LedgerRow[]>();
    rows.forEach((e) => byVault.set(e.vaultId, [...(byVault.get(e.vaultId) ?? []), e]));
    return byVault;
  }, [ledger, filter, q]);

  return (
    <main id="main" className="wrap" style={{ paddingBlock: "var(--s-8)" }}>
      <div ref={ref as React.RefObject<HTMLDivElement>} className="reveal" data-at={at}>
        <header className="section-head" style={{ maxWidth: "none", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <h1 style={{ fontSize: "clamp(1.7rem,4vw,2.4rem)" }}>Audit ledger</h1>
            <p className="lede" style={{ marginTop: 6 }}>Every event, append-only: what COMPUTED, what was JUDGED, source and latency. Webhooks append live.</p>
          </div>
          <Link to="/">The instrument</Link>
        </header>

        <div className="console-bar" role="search" aria-label="Ledger filters">
          <label className="sr-only" htmlFor="f">Filter rows</label>
          <select id="f" className="control" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} data-testid="ledger-filter" aria-label="Filter ledger rows">
            {FILTERS.map((fName) => <option key={fName} value={fName}>{fName}</option>)}
          </select>
          <label className="sr-only" htmlFor="q">Search events</label>
          <input id="q" className="control" placeholder="Search src, payload…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="ledger-search" />
          <FilterChip on={q.trim() !== ""} label="search" onClear={() => setQ("")} onClearName="clear-search" />
        </div>

        {grouped.size === 0 ? (
          <div className="panel console-empty" data-testid="ledger-empty">
            <h2 style={{ fontSize: "1.1rem" }}>Nothing in the ledger yet.</h2>
            <p className="small">Seal a vault at <Link to="/vault/new">/vault/new</Link> or replay the sandbox demo.</p>
            <button className="dlbtn" type="button" onClick={() => { setFilter("All"); setQ(""); }}>Clear filters</button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "var(--s-8)", marginTop: "var(--s-5)" }} data-testid="ledger-groups">
            {consoleGroups(vaults, grouped)}
          </div>
        )}
      </div>
    </main>
  );
}

function FilterChip({ on, label, onClear, onClearName }: { on: boolean; label: string; onClear: () => void; onClearName?: string }) {
  if (!on) return null;
  return (
    <span className="chip" data-tone="PASS" style={{ gap: 8 }}>
      active: {label}
      <button type="button" className="dlbtn" onClick={onClear} data-testid={onClearName} aria-label={`Clear ${label} filter`}>×</button>
    </span>
  );
}

function consoleGroups(vaults: Record<string, { id: string; state: string }>, grouped: Map<string, LedgerRow[]>) {
  return [...grouped.entries()].map(([vid, rows]) => {
    const v = vaults[vid];
    return (
      <section key={vid} aria-label={`Ledger for ${vid}`}>
        <div className="group-name" style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <code>{vid}</code>
          <span className="tiny">{rows.length} events · current state {v?.state ?? "?"}</span>
        </div>
        <div className="panel" style={{ overflowX: "auto" }}>
          <div className="led-head cols-5" aria-hidden="true">
            <span>WHEN</span><span>SRC</span><span>COMPUTED</span><span>JUDGED</span><span>LATENCY</span>
          </div>
          {rows.map((e, i) => (
            <div key={i} className="led-row cols-5" data-testid="ledger-row">
              <span className="mono-num tiny">{stamp(e.at)}</span>
              <span className="event-src small">
                {(() => { const I = srcIcon(e.src); return <I />; })()}
                <span className="mono">{e.src}</span>
              </span>
              <span className="mono tiny" style={{ overflowWrap: "anywhere" }}>{e.computed}</span>
              <span className="small" style={{ overflowWrap: "anywhere" }}>{e.judged ?? <span className="tiny mono">—</span>}</span>
              <span className="src-lat mono-num">{e.latencyMs}ms</span>
            </div>
          ))}
        </div>
      </section>
    );
  });
}
