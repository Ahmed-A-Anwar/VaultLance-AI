import { Link, useParams, useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { useStore } from "../lib/store";
import { ManifestList } from "../components/ManifestRow";
import { AmountReadout } from "../components/AmountReadout";
import { StateToken } from "../components/StateToken";
import { ProvenanceStream, type ProvEntry } from "../components/ProvenanceBlock";
import { PrimaryButton } from "../components/VaultButtons";
import { Send, Lock, Scan, Clock } from "../components/icons";
import { EVIDENCE_EVENTS } from "../lib/seed";
import { fmt } from "../lib/money";

const SUGGESTED = [
  "Was the deliverable altered after sealing?",
  "Which checks flagged?",
  "Why is one test skipped?",
];

/* /v/[token] — client portal, read-only while held */
export default function ClientPortal() {
  const { token = "" } = useParams();
  const { vaults, approve } = useStore();
  const vault = Object.values(vaults).find((v) => v.token === token);
  const [entries, setEntries] = useState<ProvEntry[]>([]);
  const [q, setQ] = useState("");
  const stream = useRef<HTMLDivElement | null>(null);
  const asked = useRef(false);

  if (!vault) {
    return (
      <main id="main" className="wrap" style={{ paddingBlock: "var(--s-12)" }}>
        <nav><Link to="/">← The instrument</Link></nav>
        <div className="panel console-empty" style={{ marginTop: "var(--s-5)" }}>
          <h2 style={{ fontSize: "1.2rem" }}>This portal token doesn't exist in this sandbox.</h2>
          <p className="small">Portals are minted when a vault is sealed in this session. Try the demo: <Link to="/demo">/demo</Link>.</p>
        </div>
      </main>
    );
  }

  const ask = (question: string) => {
    if (!question.trim()) return;
    asked.current = true;
    setEntries(EVIDENCE_EVENTS.map((e, i) => ({ ...e, at: Date.now() + i, body: e.body })));
    setQ("");
  };
  const answered = entries.length > 0;
  const navigate = useNavigate();

  return (
    <main id="main">
      <div className="wrap portal-grid both" style={{ paddingBlock: "var(--s-8) 160px" }}>
        <section aria-label="Sealed manifest">
          <header className="section-head" style={{ marginBottom: "var(--s-5)" }}>
            <StateToken state="HELD" />
            <h2 style={{ fontSize: "clamp(1.5rem,3vw,2rem)" }}>{vault.title}</h2>
            <p className="small">
              Read-only while funded. Every row below is sealed — you'll see hashes, never the files, until your approval captures.
              {vault.state === "PAID" && <> This delivery already paid out; its files page <Link to={`/v/${vault.token}/files`}>is here</Link>.</>}
            </p>
          </header>
          <ManifestList items={vault.files} state="HELD" released={false} />
          <p className="tiny" style={{ marginTop: 10 }}><Lock style={{ width: 12, height: 12, display: "inline" }} /> Sealed rows are not clickable by design — the audit, not you, reads the bytes.</p>
        </section>

        <aside aria-label="Interrogation">
          <div className="panel" style={{ position: "sticky", top: 16 }}>
            <div style={{ padding: "14px 14px 0" }}>
              <p className="vs-label" data-voice="computed" style={{ margin: 0 }}><Scan style={{ width: 14, height: 14 }} /> interrogation — fixed input, evidence stream</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="field" style={{ padding: 14 }}>
              <label htmlFor="portal-q" className="sr-only">Ask about the deliverable</label>
              <div className="ask-inline">
                <input id="portal-q" className="control" placeholder="Why is one test skipped?" value={q}
                  onChange={(e) => setQ(e.target.value)} data-testid="portal-question" />
                <button className="btn" type="submit" aria-label="Ask"><Send /></button>
              </div>
              <div className="sugg">
                {SUGGESTED.map((s) => <button key={s} type="button" className="dlbtn" data-testid="suggested-q" onClick={() => ask(s)}>{s}</button>)}
              </div>
            </form>
            <div ref={stream} className="stream" aria-live="polite" data-testid="portal-stream" style={{ borderTop: "1px solid var(--rule)" }} onFocus={() => stream.current?.scrollTo({ top: stream.current.scrollHeight })}>
              <ProvenanceStream entries={entries} empty="Ask a question. Provenance blocks arrive — source, timestamp, payload. No essays." />
            </div>
          </div>
        </aside>
      </div>

      {/* sticky footer — HELD amount + gated Approve & Pay */}
      <footer className="portal-foot" data-testid="portal-foot">
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span className="tiny" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Clock style={{ width: 13, height: 13 }} /> HELD, not captured</span>
          <AmountReadout cents={vault.amountCents} size="s" tone="held" />
          <span className="tiny mono-num">{fmt(vault.amountCents)} reserved on your card until you decide</span>
        </div>
        <div style={{ minWidth: 260 }}>
          <PrimaryButton testid="approve-pay" full onClick={() => { approve(vault.id); navigate(`/v/${vault.token}/files`); }}
            disabled={answered ? false : "no-answer"}
            reason={answered ? undefined : "Approve unlocks once the audit answers at least one question — you're deciding on evidence, then."}>
            Approve &amp; Pay
          </PrimaryButton>
        </div>
      </footer>
    </main>
  );
}
