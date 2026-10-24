import { useEffect, useRef, useState } from "react";
import { EVIDENCE_EVENTS, COMPUTED, JUDGED, SEED, SANDBOX_TXN } from "../../lib/seed";
import { ProvenanceStream, type ProvEntry } from "../../components/ProvenanceBlock";
import { AmountReadout } from "../../components/AmountReadout";
import { StateToken } from "../../components/StateToken";
import { ComputedRow, VerdictChip } from "../../components/VerdictChip";
import { Send, Check, Cross, File, Clock, Seal } from "../../components/icons";
import { fmt } from "../../lib/money";
import type { ReactElement } from "react";

const SUGGESTED = [
  "Was the deliverable altered after sealing?",
  "Which checks flagged?",
  "Why is one test skipped?",
];

/* section 4 — client asks plainly, evidence stream answers */
export function SectionInterrogation() {
  const [entries, setEntries] = useState<ProvEntry[]>([]);
  const [q, setQ] = useState("");
  const streamRef = useRef<HTMLDivElement | null>(null);
  const answer = (question: string) => {
    if (!question.trim()) return;
    setEntries(EVIDENCE_EVENTS.map((e, i) => ({ ...e, at: Date.now() + i, body: `${e.body}` })));
    setQ("");
  };
  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight }); }, [entries]);
  return (
    <section className="section wrap">
      <div className="inter-grid">
        <header className="section-head">
          <StateToken state="AUDITING" />
          <h2>Interrogation: you ask plainly, evidence answers.</h2>
          <p className="lede">
            Every answer arrives as a provenance block — what produced it, when, and the payload it was computed from. No essays, no assurances.
          </p>
        </header>
        <div className="ask">
          <form onSubmit={(e) => { e.preventDefault(); answer(q); }} className="field">
            <label htmlFor="demo-q">Ask the manifest a question</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="demo-q" className="control" placeholder="What changed since the seal?" value={q}
                onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
              <button className="btn" type="submit" aria-label="Ask"><Send /></button>
            </div>
            <p className="tiny">Try: {SUGGESTED.map((s, i) => (
              <span key={s}>
                <button type="button" className="dlbtn" onClick={() => answer(s)} style={{ marginInline: 2 }}>{s}</button>
                {i < SUGGESTED.length - 1 ? " " : ""}
              </span>
            ))}</p>
          </form>
          <div className="panel stream" ref={streamRef} aria-live="polite" aria-label="Evidence stream" data-testid="evidence-stream">
            <ProvenanceStream entries={entries} empty="No evidence yet — ask a question, and the vault answers with provenance blocks, not prose." />
          </div>
        </div>
      </div>
    </section>
  );
}

/* section 5 — COMPUTED vs JUDGED, two different documents */
export function SectionVerdict() {
  return (
    <section className="section wrap">
      <header className="section-head">
        <h2>The verdict splits in two: COMPUTED and JUDGED.</h2>
        <p className="lede">One column a machine can prove; one a machine can only argue. The refund question — where money actually changes hands — lives in the second, and you can overturn it.</p>
      </header>
      <div className="verdict-grid" data-testid="verdict">
        <div className="panel verdict-list" role="list" aria-label="Computed rows" style={{ padding: "16px 14px", display: "grid", gap: 10, alignContent: "start" }}>
          <p className="vs-label" data-voice="computed" style={{ margin: 0 }}>
            <Cross style={{ width: 13, height: 13 }} aria-hidden="true" /> COMPUTED — machine-checkable, always shown
          </p>
          {COMPUTED.map((r) => <ComputedRow key={r.name} name={r.name} tone={r.result as "PASS" | "WARN"} detail={r.detail} />)}
        </div>
        <div className="judged-doc" role="region" aria-label="Judged document">
          <p className="vs-label" data-voice="judged" style={{ margin: 0 }}>
            <Seal style={{ width: 13, height: 13 }} aria-hidden="true" /> JUDGED — argued from the computed record
          </p>
          <h3 style={{ marginTop: 12, fontSize: "1.08rem" }}>{JUDGED.headline}</h3>
          <p className="small" style={{ marginTop: 8 }}>{JUDGED.body}</p>
          <p className="small" style={{ marginTop: 8, display: "inline-flex", gap: 6, alignItems: "center" }}>
            <VerdictChip tone="WARN" /> only deferral on record: 1 test, refund path
          </p>
        </div>
      </div>
    </section>
  );
}

/* section 6 — capture fires, webhook lands, files unlock */
export function SectionHandshake() {
  const v = SEED.vault;
  const [phase, setPhase] = useState<"idle" | "capturing" | "done">("idle");
  const t = (fn: () => void, ms: number) => window.setTimeout(fn, ms);
  const steps: [string, string, ReactElement][] = [
    ["approval", `Approve & Pay on the client portal — ${fmt(v.amountCents)}`, <Check key="a" style={{ width: 15, height: 15 }} />],
    ["capture (sandbox)", `capture ${SANDBOX_TXN.captureId} → ${fmt(v.amountCents)}`, <Check key="b" style={{ width: 15, height: 15 }} />],
    ["webhook", "capture.completed → ledger appends", <Clock key="c" style={{ width: 15, height: 15 }} />],
    ["unlock", "manifest → RELEASED · rows get download", <File key="d" style={{ width: 15, height: 15 }} />],
  ];
  return (
    <section className="section wrap" data-testid="handshake">
      <header className="section-head">
        <StateToken state={phase === "done" ? "PAID" : "HELD"} />
        <h2>Handshake: approval → capture → webhook → unlock.</h2>
        <p className="lede">
          Capture is one event, not a process: the money is held, it needs a verdict, and with your approval the hold completes in one step. Sandbox ids below are the real ones this build generated.
        </p>
      </header>
      <div className="sec-grid">
        <div className="panel" style={{ padding: "16px 14px", maxWidth: 560 }}>
          <ol className="hs-li" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }} data-testid="handshake-steps">
            {steps.map(([label, detail, icon]) => (
              <li key={label} className="hs-ev">
                <span aria-hidden="true" style={{ width: 16 }}>{icon}</span>
                <span className="mono small" style={{ fontWeight: 600 }}>{label}</span>
                <span className="tiny mono-num" style={{ textAlign: "right", overflowWrap: "anywhere" }}>{detail}</span>
              </li>
            ))}
          </ol>
          <button className="btn full" style={{ marginTop: 14 }} type="button" onClick={() => { setPhase("capturing"); t(() => setPhase("done"), 1800); }} data-testid="handshake-demo">
            {phase === "idle" ? "Run the handshake" : phase === "capturing" ? "Capturing…" : "Captured — replay"}
          </button>
        </div>
        <div>
          <AmountReadout cents={v.amountCents} size="m" tone={phase === "done" ? "paid" : "held"} />
          <p className="small" style={{ marginTop: 12 }}>
            Sandbox transaction <code>{SANDBOX_TXN.captureId}</code> · auth <code>{SANDBOX_TXN.authId}</code> — real ids, generated at {SANDBOX_TXN.createdAt.slice(11)}Z for this build. Vault <code>{v.id}</code> · {SEED.client}.
          </p>
        </div>
      </div>
    </section>
  );
}
