/**
 * Playground.tsx — one real escrow, two reserved sandbox identities.
 *
 * Nothing on this page is seeded in the browser: the vault, files, manifest and
 * checks come from the API, the hold is a PayPal sandbox authorization, and the
 * capture is the same approval route a customer uses. The only shortcuts are
 * the role swap and the bundled sample files.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  approvePlaygroundVault,
  fundPlaygroundVault,
  loadPlaygroundSample,
  readPlaygroundSession,
  resetPlayground,
  startPlayground,
  switchPlaygroundRole,
  type PlaygroundRole,
  type PlaygroundView,
  type SampleKind,
} from "../lib/playground";

const STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "quiet" },
  AWAITING_CLIENT: { label: "Invited", tone: "quiet" },
  AWAITING_AUTHORIZATION: { label: "Ready to fund", tone: "action" },
  AUTHORIZED: { label: "Funds held", tone: "held" },
  IN_PROGRESS: { label: "In progress", tone: "held" },
  SUBMITTED: { label: "Submitted", tone: "held" },
  VERIFYING: { label: "Checking", tone: "held" },
  AWAITING_APPROVAL: { label: "Checks complete", tone: "action" },
  CAPTURE_PENDING: { label: "Capturing", tone: "held" },
  NEEDS_REVISION: { label: "Needs revision", tone: "warn" },
  PAID: { label: "Paid", tone: "paid" },
  CANCELLED: { label: "Voided", tone: "quiet" },
};

const statusOf = (raw: string) => STATUS[raw.toUpperCase()] ?? { label: raw, tone: "quiet" };
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function Playground() {
  const navigate = useNavigate();
  const [view, setView] = useState<PlaygroundView | null>(null);
  const [role, setRole] = useState<PlaygroundRole>(readPlaygroundSession()?.role ?? "client");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "sample" | "reset" | "fund" | "approve">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    startPlayground(readPlaygroundSession()?.role ?? "client")
      .then((next) => {
        if (!live) return;
        setView(next);
        setRole(readPlaygroundSession()?.role ?? "client");
      })
      .catch((err: Error) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const status = view ? statusOf(view.status) : null;
  const failed = view?.failedChecks ?? [];
  const checks = view?.checks ?? [];
  const canFund = view
    ? ["DRAFT", "AWAITING_CLIENT", "AWAITING_AUTHORIZATION", "SUBMITTED"].includes(view.status)
    : false;
  const canApprove = view?.status === "AWAITING_APPROVAL" && failed.length === 0;
  const buyer = view?.buyer ?? readPlaygroundSession()?.buyer ?? null;

  async function guard(label: typeof busy, run: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await run();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The playground request failed.");
    } finally {
      setBusy("");
    }
  }

  const chooseRole = (next: PlaygroundRole) => {
    switchPlaygroundRole(next);
    setRole(next);
    setError(null);
  };

  const load = (kind: SampleKind) =>
    guard("sample", async () => {
      const next = await loadPlaygroundSample(kind);
      setView(next);
      setRole(readPlaygroundSession()?.role ?? "client");
      setNotice(
        kind === "complete"
          ? "Complete sample uploaded, manifest locked, and all checks passed."
          : "Uncomplete sample uploaded, manifest locked, and the real checks recorded failures."
      );
    });

  const reset = () =>
    guard("reset", async () => {
      const next = await resetPlayground();
      setView(next);
      setRole(readPlaygroundSession()?.role ?? "client");
      setNotice(`Playground reset. ${next.deleted} vault${next.deleted === 1 ? "" : "s"} cleared.`);
    });

  const fund = () =>
    guard("fund", async () => {
      chooseRole("client");
      const url = await fundPlaygroundVault();
      window.location.assign(url);
    });

  const approve = () =>
    guard("approve", async () => {
      chooseRole("client");
      const status = await approvePlaygroundVault();
      setView((current) => (current ? { ...current, status } : current));
      setNotice("Payment captured with the real approval route.");
    });

  const openRoom = () => {
    if (!view) return;
    if (role === "client") {
      navigate(`/vault/${view.vaultId}`);
      return;
    }
    navigate("/dashboard");
  };

  const sampleLine = useMemo(() => {
    if (!view?.sampleKind) return "No sample loaded yet — pick one of the two deliveries.";
    return view.sampleKind === "complete"
      ? "Complete sample: web-app archive, logo pack, README and a passing test log."
      : "Uncomplete sample: web-app archive and logo pack, no README, failing test log.";
  }, [view?.sampleKind]);

  return (
    <main className="pg" id="main">
      <a className="pg-skip" href="#pg-main">Skip to the playground</a>

      <header className="pg-head">
        <Link className="pg-wordmark" to="/">
          VaultLance <span>/ playground</span>
        </Link>
        <div className="pg-head-right">
          <span className="pg-live"><i aria-hidden="true" /> REAL API · SANDBOX MONEY</span>
          <Link className="pg-back" to="/">Back to landing</Link>
        </div>
      </header>

      <div className="pg-main" id="pg-main">
        <section className="pg-intro">
          <p className="pg-eyebrow">TWO RESERVED ACCOUNTS · ONE BROWSER</p>
          <h1 className="pg-h1">A real escrow,<br /><em>on tap.</em></h1>
          <p className="pg-lede">
            The playground signs you into the freelancer and client sandbox accounts, seeds a real
            vault through the API, and runs the same checks and PayPal sandbox capture as a
            customer delivery. No demo mode, no invented data.
          </p>
          <div className="pg-switch" role="tablist" aria-label="Playground role">
            {(["freelancer", "client"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={role === key}
                data-testid={`role-${key}`}
                className="pg-switch-btn"
                onClick={() => chooseRole(key)}
              >
                <span>{key === "freelancer" ? "Freelancer" : "Client"}</span>
                <small>{key === "freelancer" ? "delivers & submits" : "funds & decides"}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="pg-stage" aria-busy={loading || busy !== ""}>
          <div className="pg-stage-head">
            <div>
              <p className="pg-mono">SEEDED VAULT</p>
              <h2 className="pg-vault-title">{loading ? "Opening the vault…" : view?.title ?? "Playground vault"}</h2>
            </div>
            {status && (
              <span className="pg-status" data-tone={status.tone} data-testid="playground-status">
                {status.label}
              </span>
            )}
          </div>

          <div className="pg-figures">
            <div>
              <p className="pg-mono">ESCROW</p>
              <p className="pg-figure">{view ? usd.format(view.amount) : "—"}</p>
            </div>
            <div>
              <p className="pg-mono">SAMPLE</p>
              <p className="pg-figure-sm">{view?.sampleKind ? (view.sampleKind === "complete" ? "Complete" : "Uncomplete") : "None"}</p>
            </div>
            <div>
              <p className="pg-mono">CHECKS FAILED</p>
              <p className="pg-figure-sm" data-tone={failed.length ? "fail" : "pass"} data-testid="playground-failed">
                {failed.length}
              </p>
            </div>
          </div>

          <p className="pg-sample-line">{sampleLine}</p>

          <div className="pg-actions">
            <button
              type="button"
              className="pg-btn pg-btn-primary"
              data-testid="open-room"
              disabled={!view}
              onClick={openRoom}
            >
              {role === "client" ? "Open the client room" : "Open the freelancer dashboard"} <span aria-hidden="true">→</span>
            </button>
            {canFund && (
              <button
                type="button"
                className="pg-btn"
                data-testid="fund-hold"
                disabled={busy === "fund"}
                onClick={() => void fund()}
              >
                {busy === "fund" ? "Opening PayPal…" : "Fund the sandbox hold"}
              </button>
            )}
            {canApprove && (
              <button
                type="button"
                className="pg-btn pg-btn-paid"
                data-testid="approve-capture"
                disabled={busy === "approve"}
                onClick={() => void approve()}
              >
                {busy === "approve" ? "Capturing…" : "Approve & capture payment"}
              </button>
            )}
          </div>

          {view?.status === "AWAITING_APPROVAL" && failed.length > 0 && (
            <p className="pg-note pg-note-warn">
              The real checks found {failed.length} failure{failed.length === 1 ? "" : "s"}. Capture is
              locked until they are waived or revised — open the client room to review them.
            </p>
          )}
          {view?.status === "PAID" && (
            <p className="pg-note pg-note-paid">
              PAID. The capture is on the vault, the files are unlocked, and reset is the only thing
              that removes this run.
            </p>
          )}

          {error && <p className="pg-note pg-note-error" role="alert" data-testid="playground-error">{error}</p>}
          {notice && !error && <p className="pg-note" role="status" data-testid="playground-notice">{notice}</p>}

          <div className="pg-checks">
            <div className="pg-section-head">
              <p className="pg-mono">DETERMINISTIC CHECKS</p>
              <span className="pg-mono pg-dim">{checks.length ? `${checks.length} RAN` : "LOAD A SAMPLE TO RUN"}</span>
            </div>
            {checks.length === 0 && failed.length === 0 && (
              <p className="pg-empty">The server has no check report for this vault yet.</p>
            )}
            <ul className="pg-check-list" data-testid="playground-checks">
              {checks.map((check) => (
                <li key={check.id} className="pg-check" data-result={check.result}>
                  <span className="pg-check-result">{check.result.toUpperCase()}</span>
                  <span>
                    <strong>{check.name}</strong>
                    <small>{check.detail}</small>
                  </span>
                </li>
              ))}
              {checks.length === 0 &&
                failed.map((check) => (
                  <li key={check.id} className="pg-check" data-result="fail">
                    <span className="pg-check-result">FAIL</span>
                    <span>
                      <strong>{check.name}</strong>
                      <small>{check.detail ?? "Recorded by the deterministic checks."}</small>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </section>

        <aside className="pg-side">
          <section className="pg-card">
            <p className="pg-mono">SAMPLE DELIVERIES</p>
            <p className="pg-card-copy">
              Both archives are bundled with the API. Loading one uploads real files, locks a manifest
              and runs the checks server-side.
            </p>
            <button
              type="button"
              className="pg-sample-btn"
              data-testid="load-complete"
              disabled={busy === "sample"}
              onClick={() => void load("complete")}
            >
              <span>Load a complete sample project</span>
              <small>web app + logo pack + README + passing tests</small>
            </button>
            <button
              type="button"
              className="pg-sample-btn"
              data-testid="load-incomplete"
              disabled={busy === "sample"}
              onClick={() => void load("incomplete")}
            >
              <span>Load an uncomplete sample project</span>
              <small>web app + logo pack, no docs, failing tests</small>
            </button>
          </section>

          <section className="pg-card pg-buyer" data-testid="buyer-credentials">
            <p className="pg-mono">SANDBOX TEST BUYER</p>
            {buyer ? (
              <>
                <p className="pg-card-copy">
                  Use these at PayPal. This is a PayPal sandbox test account, not a real person and
                  not a real card.
                </p>
                <dl className="pg-creds">
                  <div>
                    <dt>EMAIL</dt>
                    <dd data-testid="buyer-email">{buyer.email}</dd>
                  </div>
                  <div>
                    <dt>PASSWORD</dt>
                    <dd data-testid="buyer-password">{buyer.password}</dd>
                  </div>
                </dl>
                <p className="pg-sandbox">SANDBOX TEST CREDENTIALS · NO REAL MONEY</p>
              </>
            ) : (
              <p className="pg-card-copy">
                The API has no sandbox buyer credentials configured. Funding stays disabled until
                they are set on the server.
              </p>
            )}
          </section>

          <section className="pg-card">
            <p className="pg-mono">CURRENT IDENTITY</p>
            <p className="pg-identity">{view?.accounts[role]?.fullName ?? "Reserved playground account"}</p>
            <p className="pg-card-copy">{view?.accounts[role]?.email ?? "Starting…"}</p>
            <p className="pg-card-copy">
              Switching roles swaps a real JWT for the other reserved account in this tab. The vault
              and its history do not change.
            </p>
          </section>

          <section className="pg-card pg-reset">
            <p className="pg-mono">STATE CONTROL</p>
            <p className="pg-card-copy">
              Reset deletes only the two playground accounts' vaults and starts a fresh one. It never
              touches another customer, and is limited to 3 resets an hour per IP.
            </p>
            <button
              type="button"
              className="pg-reset-btn"
              data-testid="reset-playground"
              disabled={busy === "reset"}
              onClick={() => void reset()}
            >
              {busy === "reset" ? "Resetting…" : "Reset playground data"}
            </button>
          </section>
        </aside>
      </div>

      <footer className="pg-foot">
        <span>REAL SANDBOX SESSIONS · REAL CHECKS · REAL PAYPAL SANDBOX CAPTURE</span>
        <Link to="/">VaultLance AI</Link>
      </footer>
    </main>
  );
}
