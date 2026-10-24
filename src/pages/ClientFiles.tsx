import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { ManifestList } from "../components/ManifestRow";
import { AmountReadout } from "../components/AmountReadout";
import { StateToken } from "../components/StateToken";
import { FreezeBar } from "../components/AmountReadout";
import { Seal, Check, Download } from "../components/icons";
import { fmt, stamp } from "../lib/money";

const ONCE_KEY = (token: string) => `vp_payoff_${token}`;

/* /v/[token]/files — released vault; the payoff transition runs once and never again */
export default function ClientFiles() {
  const { token = "" } = useParams();
  const { vaults } = useStore();
  const vault = Object.values(vaults).find((v) => v.token === token);
  const [playoff, setPlayoff] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!vault || ran.current) return;
    ran.current = true;
    const seen = sessionStorage.getItem(ONCE_KEY(token));
    if (!seen) { setPlayoff(true); sessionStorage.setItem(ONCE_KEY(token), "1"); }
  }, [vault, token]);

  if (!vault) {
    return (
      <main id="main" className="wrap" style={{ paddingBlock: "var(--s-12)" }}>
        <nav><Link to="/">← The instrument</Link></nav>
        <div className="panel console-empty" style={{ marginTop: "var(--s-5)" }}>
          <h2 style={{ fontSize: "1.2rem" }}>No released vault under that token in this sandbox.</h2>
          <p className="small">The seeded vault: <Link to="/demo">/demo</Link>.</p>
        </div>
      </main>
    );
  }

  const capture = vault.events.find((e) => e.state === "CAPTURED");

  return (
    <main id="main" className="wrap" style={{ paddingBlock: "var(--s-8)" }}>
      <div className={playoff ? "morph-in" : undefined} style={{ display: "grid", gap: "var(--s-5)" }}>
        <div className="apptop">
          <nav aria-label="Breadcrumb"><Link to={`/v/${token}`}>← Back to the portal</Link></nav>
          <span className="mono small">{vault.id}</span>
        </div>

        <header className="section-head" style={{ maxWidth: "none" }}>
          <StateToken state={vault.state} loud />
          <h1 style={{ fontSize: "clamp(1.8rem,4.5vw,2.6rem)", marginTop: 12 }}>
            {vault.state === "PAID" ? "Paid, opened, receipted." : "Approved — releasing your files."}
          </h1>
          <p className="small" style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Check style={{ width: 15, height: 15, color: "var(--paid)" }} />
            Capture <code>{vault.sandbox.captureId === "—" ? vault.sandbox.authId : vault.sandbox.captureId}</code> · {fmt(vault.amountCents)} · {stamp(capture?.at ?? Date.now())}
          </p>
        </header>

        <FreezeBar cents={vault.amountCents} state={vault.state}
          caption="The hold completed with your approval — nothing was charged twice; the reserved amount simply became the payment." />

        <ManifestList items={vault.files} state={vault.state} released />

        <p className="small" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <Download style={{ width: 14, height: 14 }} /> Every row carries its real download from this sandbox — sample stubs only, the hashes above were computed from them at seal time.
        </p>
        <div className="panel" style={{ padding: 16, maxWidth: 620 }} data-testid="payoff-note">
          <p className="small" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <Seal style={{ width: 16, height: 16, color: "var(--seal)" }} />
            This unlock ran once, at capture. It won't replay on reload — the receipt above is the durable record.
          </p>
        </div>

        <p style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <AmountReadout cents={vault.amountCents} size="m" tone="paid" />
          <span className="tiny">paid to {vault.freelancer} · ledger entry on <Link to="/console">/console</Link></span>
        </p>
      </div>
    </main>
  );
}
