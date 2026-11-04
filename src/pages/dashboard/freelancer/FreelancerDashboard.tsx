/* FreelancerDashboard.tsx — the freelancer surface. One provider, three views
   chosen by the path (Overview, Vaults, Earnings), the two drawers they open,
   and a dev panel behind Shift+D.

   Mock data only, from the freelancer's own module. Nothing here reads the
   client dashboard's live rows: the two roles share the invite registry and
   nothing else. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { displayName } from "../../../components/dashboard/session";
import { useDashUi } from "../../../components/dashboard/ui";
import { Padlock, VaultGlyph } from "../../../components/dashboard/icons";
import { useToast } from "../../../components/shared/Toasts";
import { FreelancerDataProvider, useFreelancerData } from "../../../components/freelancer/FreelancerData";
import { FreelancerLedger } from "../../../components/freelancer/FreelancerLedger";
import { KpiRow } from "../../../components/freelancer/KpiRow";
import { NewVaultDrawer } from "../../../components/freelancer/NewVaultDrawer";
import { PayoutBanner } from "../../../components/freelancer/PayoutBanner";
import { PhaseChip } from "../../../components/freelancer/PhaseChip";
import { VaultCard, type VaultAction } from "../../../components/freelancer/VaultCard";
import { trapFocus } from "../../../components/freelancer/focusTrap";
import {
  deleteDraft,
  duplicateVault,
  forceMockError,
  inviteClient,
  phaseOfVault,
  remindClient,
  remindRemainingMs,
  resetFreelancerData,
  retryPayout,
  setHasPaypalEmail,
  simulateAuditApproved,
  simulateClientAuthorized,
  simulatePayoutFailed,
  simulatePayoutSent,
  submitForReview,
  type FreelancerVault,
} from "../../../components/freelancer/mockApi";
import { fees, formatCents } from "../../../lib/fees";
import { filterBucket, sortByNeed, type Phase } from "../../../lib/freelancerPhase";
import { NEW_VAULT_EVENT } from "./roles";

const DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false;
const HOUR = 60 * 60 * 1000;

type Filter = "all" | "needs_action" | "in_escrow" | "paid";
type View = "overview" | "vaults" | "earnings";

/* the client's chip labels, uppercase: the row is the client's row */
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "ALL" },
  { key: "needs_action", label: "NEEDS ACTION" },
  { key: "in_escrow", label: "IN ESCROW" },
  { key: "paid", label: "PAID" },
];

const greetingFor = (now = new Date()) => {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const reminderLabel = (v: FreelancerVault): string | null => {
  const left = remindRemainingMs(v);
  if (left <= 0) return null;
  return `REMIND IN ${Math.ceil(left / HOUR)}H`;
};

/* ============================================================== surface === */

function Surface({ email }: { email: string }) {
  const { vaults, events, kpis, loading, error, paypalMissing, refresh, applyVault, dropVault } = useFreelancerData();
  const { query } = useDashUi();
  const { pathname } = useLocation();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>("all");
  const [drawer, setDrawer] = useState<{ step?: 1 | 2; vault?: FreelancerVault } | null>(null);
  const [details, setDetails] = useState<FreelancerVault | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dev, setDev] = useState(false);
  const [bannerOff, setBannerOff] = useState(false);
  const [, setMinute] = useState(0);

  const view: View = pathname.endsWith("/vaults")
    ? "vaults"
    : pathname.endsWith("/ledger")
      ? "earnings"
      : "overview";

  useEffect(() => {
    const open = () => setDrawer({ step: 1 });
    window.addEventListener(NEW_VAULT_EVENT, open);
    return () => window.removeEventListener(NEW_VAULT_EVENT, open);
  }, []);

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

  /* the remind label counts down; one tick a minute is enough */
  useEffect(() => {
    const timer = window.setInterval(() => setMinute((n) => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const phases = useMemo(() => vaults.map(phaseOfVault), [vaults]);
  const failed = phases.filter((p) => p === "payout_failed").length;
  const needFiles = vaults.filter((v) => phaseOfVault(v) === "funded" && v.filesCount === 0).length;
  const waiting = phases.filter((p) => p === "invited" || p === "submitted").length;

  const statusLine = loading
    ? null
    : failed > 0
      ? `${failed} PAYOUT FAILED`
      : needFiles > 0
        ? `${needFiles} VAULT${needFiles === 1 ? "" : "S"} NEED YOUR FILES`
        : waiting > 0
          ? `${waiting} VAULT${waiting === 1 ? "" : "S"} WAITING ON CLIENTS`
          : "ALL CLEAR";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = vaults
      .map((v) => ({ vault: v, phase: phaseOfVault(v) }))
      .filter(({ vault }) => !q || vault.project.toLowerCase().includes(q) || vault.clientName.toLowerCase().includes(q))
      .filter(({ phase }) => filter === "all" || filterBucket(phase) === filter);
    return sortByNeed(rows).map((r) => r.vault);
  }, [vaults, query, filter]);

  /* first name only, however long the full name is: "Good morning, Bruce." */
  const full = email.toLowerCase().includes("freelancer") ? "Maya" : displayName(email) || "Maya";
  const name = full.split(/\s+/)[0] || full;

  async function act(action: VaultAction, vault: FreelancerVault) {
    if (action === "details" || action === "receipt") {
      setDetails(vault);
      return;
    }
    if (action === "setup") {
      setDrawer({ step: 1, vault });
      return;
    }
    if (action === "upload" || action === "addFiles") {
      setDrawer({ step: 2, vault });
      return;
    }
    if (action === "invite") {
      try {
        const { inviteCode } = await inviteClient(vault.id);
        const link = `${window.location.origin}/v/${inviteCode}`;
        await navigator.clipboard?.writeText(link);
        toast({ message: "Invite link copied.", tone: "success" });
      } catch (e) {
        toast({ message: e instanceof Error ? e.message : "Couldn’t copy the link.", tone: "error" });
      }
      return;
    }

    setBusyId(vault.id);
    try {
      if (action === "remind") {
        await remindClient(vault.id);
        applyVault({ ...vault, remindedAt: Date.now() });
        toast({ message: "Reminder sent.", tone: "success" });
      } else if (action === "submit") {
        const { manifestSha256 } = await submitForReview(vault.id);
        applyVault({ ...vault, submittedAt: Date.now(), manifestSha256 });
        toast({ message: "Submitted. Your manifest is locked.", tone: "success" });
      } else if (action === "retry") {
        const next = await retryPayout(vault.id);
        applyVault(next);
        toast({ message: "Payout sent.", tone: "success" });
        setDetails((d) => (d && d.id === next.id ? next : d));
      } else if (action === "duplicate") {
        const copy = await duplicateVault(vault.id);
        await refresh();
        toast({ message: `${copy.project} created as a draft.`, tone: "success" });
      } else if (action === "delete") {
        await deleteDraft(vault.id);
        dropVault(vault.id);
        toast({ message: "Draft deleted.", tone: "info" });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      toast({ message, tone: "error", action: { label: "Retry", run: () => void act(action, vault) } });
    } finally {
      setBusyId(null);
    }
  }

  const list = (
    <div className="fd-list">
      {loading
        ? [0, 1, 2].map((i) => <div key={i} className="fd-skel fd-skel-card" style={{ animationDelay: `${i * 61.8}ms` }} />)
        : visible.map((vault, i) => (
            <VaultCard
              key={vault.id}
              vault={vault}
              phase={phaseOfVault(vault)}
              index={i}
              busy={busyId === vault.id}
              remindLabel={reminderLabel(vault)}
              onAction={(a, v) => void act(a, v)}
            />
          ))}
      {!loading && visible.length === 0 && (
        <div className="fd-empty">
          <span className="fd-empty-mark" aria-hidden="true">
            <VaultGlyph width="144" height="144" />
          </span>
          <p className="fd-empty-text">
            {vaults.length === 0 ? "No vaults yet. Create your first vault." : "Nothing in this filter."}
          </p>
          {vaults.length === 0 && (
            <button type="button" className="fd-btn fd-btn-primary" onClick={() => setDrawer({ step: 1 })}>
              New vault
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fd-page" data-view={view}>
      {view === "overview" && (
        <div className="fd-band">
          <div className="fd-greet">
            <h1 className="fd-h1">
              {greetingFor()}, {name}.
            </h1>
            {loading ? (
              <span className="fd-skel fd-skel-line" aria-hidden="true" />
            ) : (
              <p className="dash-eyebrow dash-greeting-line fd-statusline" data-tone={failed ? "danger" : undefined}>
                <span className="dash-eyebrow-mark" aria-hidden="true" />
                {statusLine}
              </p>
            )}
          </div>
          <KpiRow kpis={kpis} failed={!kpis && !!error} />
        </div>
      )}

      {view !== "earnings" && <PayoutBanner show={paypalMissing && !bannerOff} />}

      {error && (
        <div className="fd-error-bar" role="alert">
          <span>{error}</span>
          <button type="button" className="fd-btn fd-btn-ghost" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      {view === "overview" && (
        <div className="fd-lower">
          <section className="fd-col" aria-labelledby="fd-vaults-h">
            <div className="fd-head">
              <h2 id="fd-vaults-h" className="fd-h2">
                Your vaults
              </h2>
              {vaults.length > 0 && (
                <div className="dash-chips" role="group" aria-label="Filter vaults">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className="dash-chip-filter"
                      aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {list}
          </section>

          <section className="fd-ledger" aria-labelledby="fd-earn-h">
            <div className="fd-ledger-head">
              <h2 id="fd-earn-h" className="fd-h2">
                Earnings
              </h2>
            </div>
            <FreelancerLedger events={events} loading={loading} />
          </section>
        </div>
      )}

      {view === "vaults" && (
        <section className="fd-col fd-wide" aria-labelledby="fd-vaults-h2">
          <div className="fd-head">
            <h2 id="fd-vaults-h2" className="fd-h2">
              Your vaults
            </h2>              {vaults.length > 0 && (
                <div className="dash-chips" role="group" aria-label="Filter vaults">
                  {FILTERS.map((f) => (
                    <button key={f.key} type="button" className="dash-chip-filter" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
          </div>
          {list}
        </section>
      )}

      {view === "earnings" && (
        <section className="fd-earnings" aria-labelledby="fd-earn-h2">
          <h2 id="fd-earn-h2" className="fd-h2">
            Earnings
          </h2>
          <div className="fd-sums">
            <div className="fd-sum">
              <span className="fd-kpi-label">THIS MONTH</span>
              <span className="fd-sum-num">{formatCents(kpis?.paidOutCents ?? 0)}</span>
            </div>
            <div className="fd-sum">
              <span className="fd-kpi-label">ALL TIME</span>
              <span className="fd-sum-num">{formatCents(kpis?.paidOutCents ?? 0)}</span>
            </div>
            <div className="fd-sum">
              <span className="fd-kpi-label">PENDING PAYOUT</span>
              <span className="fd-sum-num">{formatCents(kpis?.inEscrowCents ?? 0)}</span>
            </div>
          </div>
          <div className="fd-ledger fd-ledger-wide">
            <FreelancerLedger events={events} loading={loading} />
          </div>
        </section>
      )}

      {drawer && (
        <NewVaultDrawer
          openAt={drawer.step}
          vault={drawer.vault}
          onClose={() => setDrawer(null)}
          onCreated={(_, invited) => {
            void refresh();
            if (!invited) toast({ message: "Draft saved.", tone: "success" });
          }}
        />
      )}

      {details && (
        <DetailsDrawer
          vault={details}
          phase={phaseOfVault(details)}
          events={events.filter((e) => e.vaultId === details.id)}
          onClose={() => setDetails(null)}
          onAction={(a) => void act(a, details)}
        />
      )}

      {DEV && dev && (
        <div className="fd-dev" role="dialog" aria-label="Mock event panel">
          <p className="fd-dev-title">MOCK EVENTS</p>
          <button type="button" onClick={() => void simulateClientAuthorized("v_0004")}>Client authorized</button>
          <button type="button" onClick={() => void simulateAuditApproved("v_0005")}>Audit completed</button>
          <button type="button" onClick={() => void simulatePayoutSent("v_0005")}>Capture + payout sent</button>
          <button type="button" onClick={() => void simulatePayoutFailed("v_0006")}>Payout failed</button>
          <button type="button" onClick={() => { setHasPaypalEmail(false); setBannerOff(false); toast({ message: "PayPal email cleared (mock).", tone: "info" }); }}>Hide PayPal email</button>
          <button type="button" onClick={() => { forceMockError(); void refresh(); }}>Force error</button>
          <button type="button" onClick={() => { resetFreelancerData(); void refresh(); }}>Reset mock data</button>
          <button type="button" onClick={() => setDev(false)}>Close</button>
        </div>
      )}
    </div>
  );
}

/* ========================================================== details === */

function DetailsDrawer({
  vault,
  phase,
  events,
  onClose,
  onAction,
}: {
  vault: FreelancerVault;
  phase: Phase;
  events: Array<{ id: string; at: string; type: string; note?: string }>;
  onClose: () => void;
  onAction: (a: VaultAction) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const fee = fees(vault.amountCents);

  useEffect(() => {
    if (!panel.current) return;
    const trap = trapFocus(panel.current, onClose);
    return () => trap.release();
  }, [onClose]);

  const paid = phase === "paid";

  return (
    <div className="fd-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fd-drawer" role="dialog" aria-modal="true" aria-labelledby="fd-details-h" ref={panel} tabIndex={-1}>
        <header className="fd-drawer-head">
          <div>
            <h2 id="fd-details-h" className="fd-drawer-title">
              {vault.project}
            </h2>
            <p className="fd-mono fd-dim">VAULT {vault.id.toUpperCase()}</p>
          </div>
          <PhaseChip phase={phase} />
          <button type="button" className="fd-icon-btn" aria-label="Close details" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="fd-drawer-body">
          <section className="fd-detail-sec">
            <h3 className="fd-h3">Money</h3>
            <p><span>AMOUNT</span><span>{formatCents(fee.amountCents)}</span></p>
            <p><span>VAULTLANCE FEE 5%</span><span>−{formatCents(fee.vaultlanceFeeCents)}</span></p>
            <p><span>PAYPAL FEE{paid ? "" : " (EST.)"}</span><span>−{formatCents(fee.paypalFeeCents)}</span></p>
            <p className="fd-fees-total"><span>YOU RECEIVE{paid ? "" : " (EST.)"}</span><span>{formatCents(fee.payoutCents)}</span></p>
            {paid && vault.payoutPaypalId && <p className="fd-mono fd-dim">PAYPAL {vault.payoutPaypalId}</p>}
          </section>

          <section className="fd-detail-sec">
            <h3 className="fd-h3">Deliverables</h3>
            {vault.files.length === 0 && <p className="fd-dim">Nothing uploaded yet.</p>}
            {vault.files.map((f) => (
              <div key={f.name} className="fd-file-line">
                <span>{f.name}</span>
                <span className="fd-dim">{Math.max(1, Math.round(f.sizeBytes / 1024))} KB</span>
              </div>
            ))}
            {vault.manifestSha256 && (
              <p className="fd-manifest">
                <span className="fd-mono fd-dim">MANIFEST SHA-256 (MOCK)</span>
                <span className="fd-mono">{vault.manifestSha256.slice(0, 24)}…</span>
              </p>
            )}
          </section>

          <section className="fd-detail-sec">
            <h3 className="fd-h3">Timeline</h3>
            <ol className="fd-timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="fd-dot" aria-hidden="true" />
                  <span className="fd-event">{e.type}</span>
                  <span className="fd-mono fd-dim">{new Date(e.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
              {events.length === 0 && <li className="fd-dim">No events on this vault yet.</li>}
            </ol>
          </section>
        </div>

        <footer className="fd-drawer-foot">
          <button type="button" className="fd-btn fd-btn-secondary" onClick={onClose}>
            Close
          </button>
          {phase === "payout_failed" && (
            <button type="button" className="fd-btn fd-btn-primary" onClick={() => onAction("retry")}>
              Retry payout
            </button>
          )}
          {phase === "paid" && (
            <button type="button" className="fd-btn fd-btn-primary" onClick={() => onAction("duplicate")}>
              Duplicate vault
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ============================================================== entry === */

export function FreelancerDashboard({ email }: { email: string }) {
  return (
    <FreelancerDataProvider>
      <Surface email={email} />
    </FreelancerDataProvider>
  );
}

export { Padlock };
