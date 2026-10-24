import { Link, useParams } from "react-router-dom";
import { useStore } from "../lib/store";
import { StateToken } from "../components/StateToken";
import { ManifestList } from "../components/ManifestRow";
import { AmountReadout, FreezeBar } from "../components/AmountReadout";
import { QrPanel } from "../components/QrPanel";
import { CopyButton } from "../components/VaultButtons";
import { Seal, Check, Clock } from "../components/icons";
import { fmt, stamp, shortStamp } from "../lib/money";

/* /vault/[id] — freelancer's side: the state flip is the loudest thing on screen */
export default function VaultDetail() {
  const { id = "" } = useParams();
  const { vaults } = useStore();
  const vault = vaults[id];
  const base = typeof window !== "undefined" ? window.location.origin : "";

  if (!vault) {
    return (
      <main id="main" className="wrap" style={{ paddingBlock: "var(--s-12)" }}>
        <nav><Link to="/">← The instrument</Link></nav>
        <div className="panel console-empty" style={{ marginTop: "var(--s-5)" }}>
          <h2 style={{ fontSize: "1.2rem" }}>That vault id isn't in this sandbox.</h2>
          <p className="small">Vaults live in this browser session. Seal one at <Link to="/vault/new">/vault/new</Link>, or watch the seeded demo — <code>vp_8f3kq2nx4t</code> — on <Link to="/demo">/demo</Link>.</p>
        </div>
      </main>
    );
  }

  const paid = vault.state === "PAID";
  const payout = vault.events.find((e) => e.state === "PAID");

  return (
    <main id="main" className="wrap" style={{ paddingBlock: "var(--s-12)" }}>
      <div className="apptop">
        <nav aria-label="Breadcrumb"><Link to="/">The instrument</Link></nav>
        <span className="mono small">{vault.id}</span>
      </div>

      <div className="vd-hero">
        {/* ONE dominant state token — louder than anything else on the page */}
        <div style={{ display: "grid", gap: 8, justifyItems: "start" }} data-testid="detail-state">
          <StateToken state={vault.state} loud />
          <p className="small">
            {vault.state === "SEALED" && "Manifest sealed. Waiting on the client's authorization."}
            {vault.state === "HELD" && "Authorization held — not captured. The audit engine reads the manifest."}
            {(vault.state === "AUDITING") && "Auditing: every row is being re-hashed and checked against the brief."}
            {vault.state === "CAPTURED" && "Capture fired. Ledger is appending the webhook."}
            {vault.state === "RELEASED" && "Webhook landed. Files are unlocked for the client."}
            {vault.state === "PAID" && "Payout lane complete. This is the end state — nothing else moves."}
            {vault.state === "VOIDED" && "Authorization voided. Nothing was captured; the vault stays sealed."}
          </p>
        </div>
        <FreezeBar cents={vault.amountCents} state={vault.state} caption="Authorization held on the client's card. Capture happens only with their approval; void happens only on a rejection." />
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
          <div><p className="tiny">Held</p><AmountReadout cents={vault.amountCents} size="m" tone="held" /></div>
          <div><p className="tiny">Payout after approval</p><span className="mono small">{fmt(vault.amountCents)} → {vault.freelancer ?? "you"}</span></div>
        </div>
      </div>

      <div className="sec-grid">
        <div className="panel-gap">
          <h2 style={{ margin: 0 }}>{vault.title}</h2>
          <p className="small"><strong>Brief:</strong> {vault.brief}</p>
          {vault.stagingUrl && <p className="small">Staging: <a href={vault.stagingUrl} rel="noreferrer">{vault.stagingUrl}</a></p>}
          <ManifestList items={vault.files} state={vault.state} released />
        </div>
        <aside className="panel-gap">
          <div className="panel share-grid" style={{ padding: 16 }}>
            <QrPanel url={`${base}/v/${vault.token}`} caption="The client's read-only portal — no account needed." />
            <div className="field">
              <label htmlFor="share">Share link</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code id="share" className="small" style={{ wordBreak: "break-all" }}>{base}/v/{vault.token}</code>
                <CopyButton text={`${base}/v/${vault.token}`} />
              </div>
            </div>
          </div>
          <div className="panel" style={{ padding: 16 }} data-testid="payout-row">
            <p className="tiny" style={{ margin: 0, marginBottom: 6 }}>Payout lane</p>
            {payout ? (
              <div className="payout-row" style={{ margin: 0 }}>
                <span className="small event-src"><Seal style={{ width: 14, height: 14 }} /> <strong>payout appended on webhook {shortStamp(payout.at)}</strong></span>
                <span className="mono small">{fmt(vault.amountCents)} · capture {vault.sandbox.captureId}</span>
                <span className="tiny">Webhook receipt kept on the ledger — <Link to="/console">see it live</Link>.</span>
              </div>
            ) : (
              <p className="small" style={{ display: "inline-flex",gap: 6, alignItems: "center" }}>
                <Clock style={{ width: 14, height: 14 }} /> No payout yet — the row appends here when the client's approval captures.
              </p>
            )}
            {paid && <p className="tiny" style={{ marginTop: 6 }}><Check style={{ width: 12, height: 12, display: "inline" }} /> This vault reached its final state at {stamp(payout?.at ?? Date.now())}</p>}
          </div>
          <p className="tiny">Sandbox auth <code>{vault.sandbox.authId}</code> · created {stamp(vault.sandbox.createdAt)}.</p>
        </aside>
      </div>
    </main>
  );
}
