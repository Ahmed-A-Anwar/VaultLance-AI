import { Link, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useStore } from "../lib/store";
import { SEED, SANDBOX_TXN, EVIDENCE_EVENTS } from "../lib/seed";
import { StateToken } from "../components/StateToken";
import { ManifestList } from "../components/ManifestRow";
import { AmountReadout, FreezeBar } from "../components/AmountReadout";
import { ProvenanceStream, type ProvEntry } from "../components/ProvenanceBlock";
import { Scan, Clock } from "../components/icons";
import { stamp, shortStamp } from "../lib/money";

/* /demo — a seeded state of the real app; SOLO path replays the sandbox txn live */
export default function Demo() {
  const [params] = useSearchParams();
  const { vaults, startReplay, replayTick } = useStore();
  const id = params.get("vault") ?? SEED.vault.id;
  const vault = vaults[id];

  /* entering /demo arms the seeded replay — timers in the store, real ledger rows */
  useEffect(() => { startReplay(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!vault) {
    return (
      <main id="main" className="wrap" style={{ paddingBlock: "var(--s-12)" }}>
        <Link to="/">← The instrument</Link>
        <p className="panel console-empty" style={{ marginTop: "var(--s-5)" }}>No vault <code>{id}</code> in this sandbox. <Link to="/demo">Replay the seeded one.</Link></p>
      </main>
    );
  }

  const steps = vault.events.length;
  const started = steps > 2 || replayTick > 0;
  const stream = EVIDENCE_EVENTS.map((e, i) => ({ ...e, at: Date.now() + i * 600 }) as ProvEntry);

  return (
    <main id="main" className="wrap" style={{ paddingBlock: "var(--s-8)" }}>
      <div className="apptop">
        <nav aria-label="Breadcrumb"><Link to="/">The instrument</Link></nav>
        <span className="mono small">demo · <code>{vault.id}</code></span>
      </div>

      {/* honesty banner: this build's real sandbox ids and timestamp, labelled */}
      <div className="demo-banner" data-testid="demo-banner" role="note">
        <span>
          <strong>Seeded sandbox.</strong> Replaying authorization <code>{SANDBOX_TXN.authId}</code> → capture <code>{SANDBOX_TXN.captureId}</code>, created {stamp(SANDBOX_TXN.createdAt)}.
        </span>
        <span className="chip" data-tone="WARN"><Scan /> Illustrative data — real ids, local hashes</span>
      </div>

      <div className="sec-grid" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
        {/* freelancer seat: the vault, state flipping live */}
        <section aria-label="Freelancer view" data-testid="demo-vault">
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <StateToken state={vault.state} loud />
            <div style={{ display: "grid", gap: 2 }}>
              <span className="tiny">transaction</span>
              <span className="mono small">{vault.sandbox.authId} · event {steps}/{Math.max(4, steps)} · {shortStamp(vault.events[steps - 1]?.at ?? Date.now())}</span>
            </div>
          </div>
          <FreezeBar cents={vault.amountCents} state={vault.state} caption="Live replay — the same events, timers and ledger rows the app produces on real webhooks, sandbox-labelled." />
          <div style={{ marginTop: "var(--s-5)" }}>
            <ManifestList items={vault.files} state={vault.state} released />
          </div>
          <p className="tiny" style={{ marginTop: 10 }}>
            Freelancer seat: <Link to={`/vault/${vault.id}`}>/vault/{vault.id}</Link> · client seat (read-only): <Link to={`/v/${vault.token}`}>/v/{vault.token}</Link> · ledger: <Link to="/console">/console</Link>.
          </p>
        </section>

        {/* client seat preview: interrogation stream seeded, approve auto-fires mid-replay */}
        <section aria-label="Client view">
          <p className="vs-label" data-voice="computed" style={{ marginBlock: "var(--s-5) 8px" }}>
            <Scan style={{ width: 14, height: 14 }} /> client seat — evidence stream fills as the audit runs
          </p>
          <div className="panel" data-testid="demo-stream">
            <ProvenanceStream entries={started ? stream : []} empty="Provenance stream arrives with the audit engine — a beat away." />
          </div>
          <div className="portal-foot" style={{ marginTop: 10 }}>
            <span className="tiny" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Clock style={{ width: 13, height: 13 }} /> capture auto-approves mid-replay — approval would be yours in the real flow</span>
            <AmountReadout cents={vault.amountCents} size="s" tone={vault.state === "PAID" ? "paid" : "held"} />
          </div>
        </section>
      </div>
    </main>
  );
}
