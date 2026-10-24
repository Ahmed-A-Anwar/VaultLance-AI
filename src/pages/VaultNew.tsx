import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { manifestFromZip, type ManifestItem } from "../lib/hash";
import { pence } from "../lib/money";
import { PrimaryButton } from "../components/VaultButtons";
import { ManifestList } from "../components/ManifestRow";
import { CloudIn, Seal as SealIcon, Cross } from "../components/icons";
import { useMorph } from "../lib/transitions";
import { useStore } from "../lib/store";

/* /vault/new — freelancer creates the vault */
export default function VaultNew() {
  const nav = useNavigate();
  const store = useStore();
  const { startMorph } = useMorph();
  const [items, setItems] = useState<ManifestItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [brief, setBrief] = useState("");
  const [staging, setStaging] = useState("");
  const [drag, setDrag] = useState(false);
  const [title, setTitle] = useState("");
  const input = useRef<HTMLDivElement>(null);

  const readZip = async (f: File) => {
    setErr(null); setBusy(true);
    try {
      if (!f.name.toLowerCase().endsWith(".zip")) throw new Error("Not a zip file — drop the deliverable zip.");
      const manifest = await manifestFromZip(f);
      if (!manifest.length) throw new Error("That zip is empty after skipping metadata files.");
      setItems(manifest);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read that zip."); setItems(null); }
    finally { setBusy(false); }
  };

  const cents = pence(amount);
  const blockers: [boolean, string][] = [
    [!items, "drop the deliverable zip first"],
    [amount.length > 0 && cents <= 0, "that amount reads as zero — try 4,250.00"],
    [!(amount.length > 0) || cents <= 0, "name an amount above zero"],
    [brief.trim().length < 12, "the brief needs at least one full sentence"],
  ];
  const reason = blockers.find(([bad]) => bad)?.[1];

  const seal = () => {
    if (!items || reason) return;
    const v = store.createVault({ title: title.trim() || "Untitled delivery", amountCents: cents, brief, stagingUrl: staging || undefined, files: items });
    startMorph(input.current ?? document.body, "Vault");
    nav(`/vault/${v.id}`);
  };

  return (
    <main id="main" className="wrap" style={{ paddingBlock: "var(--s-12)" }}>
      <nav aria-label="Breadcrumb"><a href="/">← The instrument</a></nav>
      <header style={{ marginBlock: "var(--s-5)" }}>
        <h1 style={{ fontSize: "clamp(2rem,5vw,2.6rem)" }}>Seal a vault</h1>
        <p className="lede">Drop the deliverable. VaultLance hashes it locally (sha-256, no upload), holds the client's authorization, and releases only toward a verdict.</p>
      </header>

      <div className="pages-grid">
        <section className="panel-gap" aria-label="Deliverable intake">
          <div
            ref={input}
            className={`drop${drag ? " drop-live" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void readZip(e.dataTransfer.files[0]); }}
          >
            <CloudIn style={{ width: 28, height: 28, color: drag ? "var(--seal)" : "var(--ink-soft)" }} />
            {busy ? <p><strong>Reading the zip…</strong></p>
              : items ? <p><strong>{items.length} rows hashed.</strong> Nothing left this machine.</p>
              : <p><strong>Drop the deliverable zip.</strong></p>}
            <p className="tiny">Path, byte-size, sha-256 — one row each in the manifest preview. Keyboard: pick the file below.</p>
            {err && <p className="warn-reason" role="alert"><Cross style={{ width: 13, height: 13 }} /> {err}</p>}
            <input id="zipfile" className="control" type="file" accept=".zip" data-testid="zip-input"
              onChange={(e) => e.target.files?.[0] && void readZip(e.target.files[0])} />
          </div>

          <div className="field">
            <label htmlFor="vault-title">One-line delivery name</label>
            <input id="vault-title" className="control" placeholder="Onboarding portal redesign — 6 screens"
              value={title} onChange={(e) => setTitle(e.target.value)} data-testid="vault-title" />
          </div>
          <div className="field">
            <label htmlFor="vault-amount">Amount to hold (USD)</label>
            <input id="vault-amount" className="control mono-num" inputMode="decimal" placeholder="4,250.00"
              value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="vault-amount"
              aria-invalid={amount.length > 0 && cents <= 0} />
          </div>
          <div className="field">
            <label htmlFor="vault-brief">The brief, verbatim</label>
            <textarea id="vault-brief" className="control" placeholder="What was promised — the interrogation reads this."
              value={brief} onChange={(e) => setBrief(e.target.value)} data-testid="vault-brief" />
          </div>
          <div className="field">
            <label htmlFor="vault-staging">Staging URL <span className="reason">(optional)</span></label>
            <input id="vault-staging" className="control" placeholder="https://your-commit-preview.app/…"
              value={staging} onChange={(e) => setStaging(e.target.value)} data-testid="vault-staging" />
          </div>
        </section>

        <aside className="panel-gap" aria-label="Manifest preview and seal">
          {items
            ? <ManifestList items={items} state="SEALED" released={false} />
            : <div className="panel prov-empty">The manifest appears the moment a zip lands — real paths, sizes, hashes, computed in this browser.</div>}
          <PrimaryButton testid="seal-vault" full onClick={seal} disabled={Boolean(reason)} reason={reason && `Seal vault — ${reason}.`}>
            <SealIcon style={{ width: 16, height: 16 }} /> Seal vault
          </PrimaryButton>
          <p className="tiny">Sealing writes the manifest to the sandbox vault and returns a share link the client can open without an account.</p>
        </aside>
      </div>
    </main>
  );
}
