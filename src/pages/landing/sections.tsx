import { useRef, useEffect, useState } from "react";
import { SEED, SANDBOX_TXN } from "../../lib/seed";
import { AmountReadout, FreezeBar } from "../../components/AmountReadout";
import { ManifestList } from "../../components/ManifestRow";
import { StateToken } from "../../components/StateToken";
import { fmt, stamp } from "../../lib/money";

/* M1 — one orchestrated reveal per section, once, IntersectionObserver. */
export function useReveal() {
  const ref = useRef<HTMLElement | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setAt(1); io.disconnect(); } }, { rootMargin: "-60px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, at } as const;
}
export function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, at } = useReveal();
  return <section ref={ref} className={`reveal ${className}`} data-at={at}>{children}</section>;
}

export function SectionProblem() {
  return (
    <Reveal className="section wrap">
      <header className="section-head">
        <h2>You paid. The work was broken. The money is gone.</h2>
        <p className="lede">Real sentences from a real failure mode — deliverables paid upfront, judged informally, disputed too late.</p>
      </header>
      <div className="prob" style={{ maxWidth: "80ch" }}>
        {[
          ["You wire the deposit, then wait.", "Weeks later a zip arrives. It builds, mostly, on one machine in a chat window — with no record of what changed since you paid."],
          ["\u201CIt's not quite what we agreed.\u201D", "The brief exists, the files exist, and the difference between them sits in an inbox thread. There is nothing to point at."],
          ["Refunds need leverage you don't have.", "Once money is captured, getting it back is a dispute, not a decision. Cards, banks and platforms resolve to whoever has the receipt."],
        ].map(([h, p]) => (
          <div className="prob-row" key={h}><h3>{h}</h3><p className="small" style={{ maxWidth: "70ch" }}>{p}</p></div>
        ))}
      </div>
    </Reveal>
  );
}

export function SectionFreeze() {
  const v = SEED.vault;
  return (
    <Reveal className="section wrap">
      <div className="sec-grid">
        <header className="section-head">
          <StateToken state="HELD" />
          <h2>The money freezes. It does not move.</h2>
          <p className="lede">
            An <strong>authorization</strong> on the client's card reserves {fmt(v.amountCents)} — visible to their bank as a hold,
            absent from your balance. Capture is a separate step that nobody can take before a verdict.
          </p>
          <p className="ticker-note">Sandbox authorization <code>{SANDBOX_TXN.authId}</code>, created {stamp(SANDBOX_TXN.createdAt)} — a real id, generated for this build.</p>
        </header>
        <div className="hero-instr">
          <AmountReadout cents={v.amountCents} size="l" tone="held" label={`${fmt(v.amountCents)} held, not captured`} />
          <FreezeBar cents={v.amountCents} state="HELD" />
          <p className="small" style={{ maxWidth: "68ch" }}>
            Held by the client's card, never by this platform. If the audit rejects the work,
            the authorization is voided and <strong>nothing is captured</strong>. If it approves, capture fires and the vault opens.
          </p>
        </div>
      </div>
    </Reveal>
  );
}

export function SectionVault() {
  const v = SEED.vault;
  return (
    <Reveal className="section wrap">
      <div className="sec-grid">
        <header className="section-head">
          <StateToken state="SEALED" />
          <h2>The vault: a manifest, sealed at intake.</h2>
          <p className="lede">
            The client never opens the zip. The vault opens it once, hashes every row, and seals the ledger. What the client sees is this manifest — nothing else.
          </p>
        </header>
        <div className="panel-gap">
          <ManifestList items={v.files} state={"SEALED" as const} released={false} />
          <p className="small">Every hash was computed locally at seal time. The client portal shows this same manifest, still sealed.</p>
        </div>
      </div>
    </Reveal>
  );
}
