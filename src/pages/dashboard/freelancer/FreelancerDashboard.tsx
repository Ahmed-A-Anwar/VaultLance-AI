/* FreelancerDashboard.tsx — the freelancer surface. One provider, three views
   chosen by the path (Overview, Vaults, Earnings), and the two drawers they
   open: new vault / add files, and vault details.

   Mock data only, from the freelancer's own module. Nothing here reads the
   client dashboard's live rows. */

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { displayName } from "../../../components/dashboard/session";
import { useDashUi } from "../../../components/dashboard/ui";
import { VaultGlyph } from "../../../components/dashboard/icons";
import { FreelancerDataProvider, useFreelancerData } from "../../../components/freelancer/FreelancerData";
import { FreelancerLedger } from "../../../components/freelancer/FreelancerLedger";
import { KpiRow } from "../../../components/freelancer/KpiRow";
import { NewVaultDrawer } from "../../../components/freelancer/NewVaultDrawer";
import { PayoutBanner, setPaypalEmail } from "../../../components/freelancer/PayoutBanner";
import { PhaseChip } from "../../../components/freelancer/PhaseChip";
import { VaultCard } from "../../../components/freelancer/VaultCard";
import {
  phaseOfVault,
  retryPayout,
  simulateAuditApproved,
  simulateClientAuthorized,
  simulatePayoutFailed,
  type FreelancerVault,
} from "../../../components/freelancer/mockApi";
import { fees, formatCents } from "../../../lib/fees";
import { filterBucket } from "../../../lib/freelancerPhase";

const DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false;

type Filter = "all" | "needs_action" | "in_escrow" | "paid";
type View = "overview" | "vaults" | "earnings";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Needs action" },
  { key: "in_escrow", label: "In escrow" },
  { key: "paid", label: "Paid" },
];

const shortDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/* ------------------------------------------------------------------ page --- */

function Surface({ email }: { email: string }) {
  const { vaults, events, kpis, loading, error, reload } = useFreelancerData();
  const { query } = useDashUi();
  const { pathname } = useLocation();

  const [filter, setFilter] = useState<Filter>("all");
  const [drawer, setDrawer] = useState<{ mode: "new" | "files"; vault?: FreelancerVault } | null>(null);
  const [details, setDetails] = useState<FreelancerVault | null>(null);
  const [dev, setDev] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setDev((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const view: View = pathname.endsWith("/vaults")
    ? "vaults"
    : pathname.endsWith("/ledger")
      ? "earnings"
      : "overview";

  const phases = vaults.map(phaseOfVault);
  const failed = phases.filter((p) => p === "payout_failed").length;
  const needFiles = vaults.filter((v) => phaseOfVault(v) === "funded" && v.filesCount === 0).length;
  const waiting = phases.filter((p) => p === "invited" || p === "submitted").length;
  const reviewing = phases.filter((p) => p === "in_review").length;

  const line = failed
    ? `${failed} PAYOUT FAILED — CHECK YOUR PAYPAL EMAIL`
    : needFiles
      ? `${needFiles} ${needFiles === 1 ? "VAULT NEEDS" : "VAULTS NEED"} YOUR FILES`
      : waiting
        ? `${waiting} ${waiting === 1 ? "VAULT" : "VAULTS"} WAITING ON CLIENTS`
        : reviewing
          ? `${reviewing} ${reviewing === 1 ? "VAULT" : "VAULTS"} IN REVIEW`
          : "ALL CLEAR";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = email.toLowerCase().startsWith("freelancer")
    ? "Maya"
    : displayName(email).split(" ")[0] || "there";

  const q = query.trim().toLowerCase();
  const filtered = vaults.filter((v) => {
    if (q && !`${v.project} ${v.clientName}`.toLowerCase().includes(q)) return false;
    if (filter === "all") return true;
    return filterBucket(phaseOfVault(v)) === filter;
  });

  const counts: Record<Filter, number> = {
    all: vaults.length,
    needs_action: phases.filter((p) => filterBucket(p) === "needs_action").length,
    in_escrow: phases.filter((p) => filterBucket(p) === "in_escrow").length,
    paid: phases.filter((p) => filterBucket(p) === "paid").length,
  };

  const open = (kind: "new" | "files" | "details", v?: FreelancerVault) => {
    if (kind === "details" && v) {
      setDetails(v);
      return;
    }
    setDrawer({ mode: kind === "files" ? "files" : "new", ...(v ? { vault: v } : {}) });
  };

  const head = (
    <div className="fd-panel-head">
      <h2 className="fd-h2">Your vaults</h2>
      <span className="fd-count-badge">{vaults.length}</span>
      <button type="button" className="fd-btn fd-btn-primary" onClick={() => setDrawer({ mode: "new" })}>
        New vault
      </button>
    </div>
  );

  const filters = (
    <div className="fd-filters" role="group" aria-label="Filter vaults">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          className="fd-filter"
          data-on={filter === f.key ? "true" : undefined}
          aria-pressed={filter === f.key}
          onClick={() => setFilter(f.key)}
        >
          {f.label}
          <span className="fd-filter-count">{counts[f.key]}</span>
        </button>
      ))}
    </div>
  );

  const body = (
    <>
      {filters}
      {error && vaults.length === 0 ? (
        <div className="fd-empty">
          <p className="fd-empty-title">Couldn’t load your vaults.</p>
          <p className="fd-empty-text">{error}</p>
          <button type="button" className="fd-btn fd-btn-primary" onClick={reload}>
            Try again
          </button>
        </div>
      ) : loading && vaults.length === 0 ? (
        <div className="fd-list" aria-busy="true" aria-label="Loading vaults">
          {[0, 1, 2].map((i) => (
            <span key={i} className="fd-skel fd-skel-card" />
          ))}
        </div>
      ) : vaults.length === 0 ? (
        <div className="fd-empty">
          <span className="fd-empty-art" aria-hidden="true">
            <VaultGlyph width="34" height="34" />
          </span>
          <p className="fd-empty-title">No vaults yet.</p>
          <p className="fd-empty-text">
            Create one, invite your client, and the money waits in escrow until you deliver.
          </p>
          <button type="button" className="fd-btn fd-btn-primary" onClick={() => setDrawer({ mode: "new" })}>
            New vault
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="fd-empty-text">Nothing matches that filter.</p>
      ) : (
        <div className="fd-list">
          {filtered.map((v) => (
            <VaultCard key={v.id} vault={v} onOpen={open} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="fd">
      <div className="fd-upper">
        <div className="fd-greeting">
          <h1 className="fd-h1">
            {greeting}, {first}.
          </h1>
          {loading && vaults.length === 0 ? (
            <span className="fd-skel fd-skel-line" />
          ) : (
            <p className="fd-sub">{line}</p>
          )}
        </div>
        <KpiRow kpis={kpis} loading={loading} error={error} />
      </div>

      <PayoutBanner key={tick} />

      {view === "overview" && (
        <div className="fd-lower">
          <section className="fd-panel">
            {head}
            {body}
          </section>

          <section className="fd-panel fd-ledger-card">
            <div className="fd-panel-head">
              <h2 className="fd-h2">Recent activity</h2>
              <Link className="fd-link" to="/dashboard/ledger">
                Earnings →
              </Link>
            </div>
            <FreelancerLedger events={events.slice(0, 6)} vaults={vaults} />
          </section>
        </div>
      )}

      {view === "vaults" && (
        <section className="fd-panel">
          {head}
          {body}
        </section>
      )}

      {view === "earnings" && (
        <section className="fd-panel">
          <div className="fd-panel-head">
            <h2 className="fd-h2">Earnings ledger</h2>
            <span className="fd-count-badge">{events.length}</span>
          </div>
          <FreelancerLedger events={events} vaults={vaults} detail />
        </section>
      )}

      {drawer && (
        <NewVaultDrawer
          mode={drawer.mode}
          {...(drawer.vault ? { vault: drawer.vault } : {})}
          onClose={() => setDrawer(null)}
          onCreated={() => undefined}
        />
      )}

      {details && <VaultDetails vault={details} onClose={() => setDetails(null)} />}

      {DEV && dev && (
        <div className="fd-dev" role="dialog" aria-label="Mock controls">
          <p className="fd-label">MOCK CONTROLS</p>
          <button
            type="button"
            className="fd-btn fd-btn-ghost"
            onClick={() => {
              setPaypalEmail("");
              setTick((n) => n + 1);
            }}
          >
            Hide PayPal email
          </button>
          <button
            type="button"
            className="fd-btn fd-btn-ghost"
            onClick={() => {
              setPaypalEmail("maya@example.com");
              setTick((n) => n + 1);
            }}
          >
            Restore PayPal email
          </button>
          {vaults.slice(0, 3).map((v) => (
            <button
              key={v.id}
              type="button"
              className="fd-btn fd-btn-ghost"
              onClick={() => void simulateClientAuthorized(v.id).then(reload)}
            >
              Client authorizes {v.project}
            </button>
          ))}
          {vaults.slice(0, 2).map((v) => (
            <button
              key={`a-${v.id}`}
              type="button"
              className="fd-btn fd-btn-ghost"
              onClick={() => void simulateAuditApproved(v.id).then(reload)}
            >
              Client approves {v.project}
            </button>
          ))}
          {vaults.slice(0, 2).map((v) => (
            <button
              key={`f-${v.id}`}
              type="button"
              className="fd-btn fd-btn-ghost"
              onClick={() => void simulatePayoutFailed(v.id).then(reload)}
            >
              Payout fails {v.project}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- details --- */

function VaultDetails({ vault, onClose }: { vault: FreelancerVault; onClose: () => void }) {
  const { events, perform } = useFreelancerData();
  const phase = phaseOfVault(vault);
  const money = fees(vault.amountCents);
  const timeline = events.filter((e) => e.vaultId === vault.id);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copyManifest = () => {
    if (!vault.manifestSha256) return;
    void navigator.clipboard?.writeText(vault.manifestSha256).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  };

  return (
    <>
      <button type="button" className="fd-scrim" aria-label="Close details" onClick={onClose} />
      <aside
        className="fd-drawer fd-detail"
        role="dialog"
        aria-modal="true"
        aria-label={`${vault.project} details`}
      >
        <header className="fd-drawer-head">
          <div>
            <h2 className="fd-h2">{vault.project}</h2>
            <p className="fd-mono fd-detail-id">{vault.id.toUpperCase()}</p>
          </div>
          <button type="button" className="fd-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="fd-drawer-body">
          <div className="fd-detail-top">
            <PhaseChip phase={phase} />
            <span className="fd-card-amount">{formatCents(vault.amountCents)}</span>
          </div>

          <section className="fd-section">
            <h3 className="fd-label">MONEY</h3>
            <div className="fd-fee">
              <p>
                <span>CLIENT FUNDED</span>
                <span>{formatCents(money.amountCents)}</span>
              </p>
              <p>
                <span>VAULTLANCE FEE 5%</span>
                <span>−{formatCents(money.vaultlanceFeeCents)}</span>
              </p>
              <p>
                <span>PAYPAL FEE (EST.)</span>
                <span>−{formatCents(money.paypalFeeCents)}</span>
              </p>
              <p className="fd-fee-total">
                <span>YOU RECEIVE (EST.)</span>
                <span>{formatCents(money.payoutCents)}</span>
              </p>
            </div>
            {vault.payoutPaypalId && (
              <p className="fd-mono fd-note">PAYPAL {vault.payoutPaypalId}</p>
            )}
          </section>

          <section className="fd-section">
            <h3 className="fd-label">DELIVERABLES</h3>
            {vault.files.length > 0 ? (
              <ul className="fd-files">
                {vault.files.map((f) => (
                  <li key={f.name} className="fd-file">
                    <span className="fd-file-name">{f.name}</span>
                    <span className="fd-mono">{Math.max(1, Math.round(f.sizeBytes / 1024))} KB</span>
                  </li>
                ))}
              </ul>
            ) : vault.stagingUrl ? (
              <p className="fd-mono fd-note">{vault.stagingUrl}</p>
            ) : (
              <p className="fd-note dim">Nothing uploaded yet.</p>
            )}
            {vault.manifestSha256 && (
              <p className="fd-manifest">
                <span className="fd-mono">MANIFEST {vault.manifestSha256.slice(0, 16)}…</span>
                <span className="fd-mock">MOCK</span>
                <button type="button" className="fd-btn fd-btn-ghost" onClick={copyManifest}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </p>
            )}
          </section>

          <section className="fd-section">
            <h3 className="fd-label">TIMELINE</h3>
            {timeline.length === 0 ? (
              <p className="fd-note dim">No events yet.</p>
            ) : (
              <ol className="fd-timeline">
                {timeline.map((e) => (
                  <li key={e.id} className="fd-timeline-row">
                    <span className="fd-timeline-dot" aria-hidden="true" />
                    <span className="fd-timeline-label">{e.label}</span>
                    <span className="fd-mono">{shortDate(e.ts)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <footer className="fd-drawer-foot">
          <button type="button" className="fd-btn fd-btn-soft fd-btn-tall" onClick={onClose}>
            Close
          </button>
          {phase === "payout_failed" && (
            <button
              type="button"
              className="fd-btn fd-btn-primary fd-btn-tall"
              onClick={() =>
                void perform(() => retryPayout(vault.id), "Payout sent.").then((v) => {
                  if (v) onClose();
                })
              }
            >
              Retry payout
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}

export function FreelancerDashboard({ email }: { email: string }) {
  return (
    <FreelancerDataProvider>
      <Surface email={email} />
    </FreelancerDataProvider>
  );
}
