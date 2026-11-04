/* ClientPayments.tsx — the client's Payments page: what is held right now, what
   has actually left, and what came back.

   Two views of the same money: holds are promises, receipts are facts. The tabs
   switch between them without remounting the card, and the card keeps its own
   height so switching never moves the page. */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import type { ColDef, GridApi } from "ag-grid-community";
import { Check, Copy, Download, Padlock, PadlockOpen, VaultGlyph } from "../dashboard/icons";
import { WalletIcon } from "./icons";
import { MoneyCard } from "./MoneyCard";
import { StepsCard } from "./StepsCard";
import { useToast } from "../shared/Toasts";
import { formatCents } from "../../lib/fees";
import { gridTheme } from "../freelancer/gridTheme";
import {
  HONOR_DAYS,
  clientTotals,
  daysLeft,
  downloadReceipt,
  holdProgress,
  listHolds,
  listReceipts,
  type Hold,
  type Receipt,
} from "./paymentsApi";

ModuleRegistry.registerModules([AllCommunityModule]);

type Tab = "holds" | "receipts";

const fullDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();

export function ClientPayments() {
  const toast = useToast();
  const tabsId = useId();
  const [tab, setTab] = useState<Tab>("holds");
  const [holds, setHolds] = useState<Hold[] | null>(null);
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GridApi | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, r] = await Promise.all([listHolds(), listReceipts()]);
      if (!alive.current) return;
      setHolds(h);
      setReceipts(r);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : "The payments service didn’t answer.");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void load().finally(() => alive.current && setLoading(false));
    return () => {
      alive.current = false;
    };
  }, [load]);

  const totals = useMemo(() => clientTotals(holds ?? [], receipts ?? []), [holds, receipts]);
  const shown = loading && holds === null ? null : totals;

  /* the receipts grid only measures once it is on screen */
  const fit = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.sizeColumnsToFit();
  }, []);

  useEffect(() => {
    if (tab !== "receipts") return;
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab, fit]);

  const columns = useMemo<ColDef<Receipt>[]>(
    () => [
      {
        headerName: "DATE",
        field: "createdAt",
        width: 89,
        minWidth: 89,
        valueFormatter: (p) => (typeof p.value === "number" ? fullDate(p.value) : ""),
        cellRenderer: (p: { value?: number }) => (typeof p.value === "number" ? shortDate(p.value) : "—"),
      },
      { headerName: "VAULT", field: "project", flex: 1.618, minWidth: 120 },
      {
        headerName: "TYPE",
        field: "kind",
        width: 110,
        minWidth: 110,
        cellRenderer: (p: { value?: Receipt["kind"] }) => (
          <span className="pay-chip" data-tone={p.value === "capture" ? "ok" : "steel"}>
            {p.value === "capture" ? "CAPTURED" : "VOIDED"}
          </span>
        ),
      },
      {
        headerName: "AMOUNT",
        field: "amountCents",
        width: 110,
        minWidth: 110,
        type: "rightAligned",
        cellClass: "fd-cell-num pay-net",
        cellRenderer: (p: { value?: number }) => <strong>{formatCents(p.value ?? 0)}</strong>,
      },
      {
        headerName: "PAYPAL ID",
        field: "paypalId",
        flex: 1,
        minWidth: 110,
        cellRenderer: (p: { value?: string }) => (
          <button
            type="button"
            className="fd-copy"
            title={`Copy ${p.value}`}
            aria-label={`Copy PayPal ID ${p.value}`}
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard
                ?.writeText(p.value ?? "")
                .then(() => toast({ message: "PayPal ID copied.", tone: "success" }));
            }}
          >
            <span className="fd-mono">{p.value}</span>
            <Copy width="12" height="12" aria-hidden="true" />
          </button>
        ),
      },
      {
        headerName: "",
        colId: "download",
        width: 55,
        minWidth: 55,
        sortable: false,
        cellRenderer: (p: { data?: Receipt }) =>
          p.data ? (
            <button
              type="button"
              className="fd-icon-btn pay-dl"
              aria-label={`Download receipt for ${p.data.project}`}
              title="Download receipt (mock print preview)"
              onClick={() => {
                if (!downloadReceipt(p.data!)) {
                  toast({ message: "Allow pop-ups to open the receipt.", tone: "error" });
                }
              }}
            >
              <Download width="13" height="13" aria-hidden="true" />
            </button>
          ) : null,
      },
    ],
    [toast]
  );

  const tabLabel = tab === "holds" ? "Holds" : "Receipts";

  return (
    <div className="pay-page" data-role="client">
      <div className="pay-head">
        <p className="pay-caption">HOW YOU PAY AND WHAT’S HELD</p>
      </div>

      <div className="fd-kpis pay-kpis">
        <MoneyCard
          label="HELD NOW"
          cents={shown ? shown.heldCents : null}
          accent="brass"
          icon={<Padlock width="13" height="13" />}
          title="Authorized by you and still held, including vaults in audit."
        />
        <MoneyCard
          label="CAPTURED"
          cents={shown ? shown.capturedCents : null}
          accent="success"
          icon={<PadlockOpen width="13" height="13" />}
          title="Money that actually left your account."
        />
        <MoneyCard
          label="VOIDED"
          cents={shown ? shown.voidedCents : null}
          accent="steel"
          icon={<Check width="13" height="13" />}
          zeroText="NONE"
          title="Holds you released. Nothing was charged."
        />
      </div>

      <div className="pay-cols">
        <section className="pay-card pay-history" aria-labelledby={`${tabsId}-h`}>
          <div className="pay-card-head">
            <h2 id={`${tabsId}-h`} className="pay-card-h">
              Holds and receipts
            </h2>
            <div
              className="pay-tabs"
              role="tablist"
              aria-label="Holds and receipts"
              data-tab={tab}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  setTab(tab === "holds" ? "receipts" : "holds");
                }
              }}
            >
              <span className="pay-tab-ink" aria-hidden="true" />
              {(["holds", "receipts"] as Tab[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`${tabsId}-${key}-tab`}
                  aria-selected={tab === key}
                  aria-controls={`${tabsId}-${key}-panel`}
                  tabIndex={tab === key ? 0 : -1}
                  className="pay-tab"
                  onClick={() => setTab(key)}
                >
                  {key === "holds" ? "HOLDS" : "RECEIPTS"}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="pay-error" role="alert">
              <p className="pay-error-text">{error}</p>
              <button
                type="button"
                className="fd-btn fd-btn-primary pay-btn-sm"
                onClick={() => {
                  setLoading(true);
                  void load().finally(() => setLoading(false));
                }}
              >
                Retry
              </button>
            </div>
          ) : loading && !holds ? (
            <div className="pay-grid-skel" aria-busy="true" aria-label={`Loading ${tabLabel}`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="fd-skel pay-hold-skel" style={{ animationDelay: `${i * 61.8}ms` }} />
              ))}
            </div>
          ) : tab === "holds" ? (
            <div id={`${tabsId}-holds-panel`} role="tabpanel" aria-labelledby={`${tabsId}-holds-tab`} tabIndex={0}>
              {(holds ?? []).length === 0 ? (
                <div className="fd-empty pay-empty">
                  <span className="fd-empty-mark" aria-hidden="true">
                    <VaultGlyph width="144" height="144" />
                  </span>
                  <p className="fd-empty-text">No active holds.</p>
                </div>
              ) : (
                <ul className="pay-holds">
                  {(holds ?? []).map((hold) => {
                    const left = daysLeft(hold);
                    const urgent = left <= HONOR_DAYS;
                    return (
                      <li key={hold.vaultId} className="pay-hold">
                        <div className="pay-hold-top">
                          <span className="pay-hold-project">{hold.project}</span>
                          <span className="pay-hold-amt">{formatCents(hold.amountCents)}</span>
                        </div>
                        <div className="pay-hold-meta">
                          <span>Authorized {fullDate(hold.authorizedAt)}</span>
                          <span className="pay-hold-exp" data-urgent={urgent ? "true" : "false"}>
                            Expires in {left} {left === 1 ? "day" : "days"}
                            <span className="pay-mock">MOCK</span>
                          </span>
                          <span
                            className="pay-info"
                            tabIndex={0}
                            role="img"
                            title="PayPal holds the money for up to about 29 days. After that the hold expires."
                            aria-label="PayPal holds the money for up to about 29 days. After that the hold expires."
                          >
                            i
                          </span>
                          <Link className="fd-btn fd-btn-secondary pay-btn-sm pay-hold-open" to={`/vault/${hold.vaultId}`}>
                            Open vault
                          </Link>
                        </div>
                        <span className="pay-bar" aria-hidden="true">
                          <span style={{ width: `${Math.round(holdProgress(hold) * 100)}%` }} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div id={`${tabsId}-receipts-panel`} role="tabpanel" aria-labelledby={`${tabsId}-receipts-tab`} tabIndex={0}>
              {(receipts ?? []).length === 0 ? (
                <div className="fd-empty pay-empty">
                  <span className="fd-empty-mark" aria-hidden="true">
                    <VaultGlyph width="144" height="144" />
                  </span>
                  <p className="fd-empty-text">No receipts yet. Captures and releases appear here.</p>
                </div>
              ) : (
                <>
                  <div
                    className="fd-grid pay-grid pay-grid-receipts ag-theme-quartz-dark"
                    ref={wrapRef}
                    role="group"
                    aria-label="Receipts"
                    style={{ height: 34 + Math.min(Math.max((receipts ?? []).length, 1), 6) * 55 }}
                  >
                    <AgGridReact<Receipt>
                      theme={gridTheme}
                      rowData={receipts ?? []}
                      columnDefs={columns}
                      headerHeight={34}
                      rowHeight={55}
                      getRowId={(p) => p.data?.id ?? ""}
                      onGridReady={(p) => {
                        apiRef.current = p.api;
                        fit();
                      }}
                    />
                  </div>

                  {/* under 768 the grid becomes these 89px cards */}
                  <ul className="pay-mlist" aria-label="Receipts">
                    {(receipts ?? []).map((r) => (
                      <li key={r.id} className="pay-mcard">
                        <span className="pay-mcard-top">
                          <span className="pay-mcard-title">{r.project}</span>
                          <span className="pay-mcard-num">{formatCents(r.amountCents)}</span>
                        </span>
                        <span className="pay-mcard-bot">
                          <span className="pay-chip" data-tone={r.kind === "capture" ? "ok" : "steel"}>
                            {r.kind === "capture" ? "CAPTURED" : "VOIDED"}
                          </span>
                          <span className="pay-mcard-date">{shortDate(r.createdAt)}</span>
                          <button
                            type="button"
                            className="pay-dl"
                            aria-label={`Download receipt for ${r.project}`}
                            onClick={() => {
                              if (!downloadReceipt(r)) {
                                toast({ message: "Allow pop-ups to open the receipt.", tone: "error" });
                              }
                            }}
                          >
                            <Download width="12" height="12" aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>

        <div className="pay-side">
          <section className="pay-card" aria-labelledby={`${tabsId}-pm`}>
            <div className="pay-card-head">
              <h2 id={`${tabsId}-pm`} className="pay-card-h">
                Payment method
              </h2>
              <span className="pay-chip pay-chip-ok" data-tone="ok">
                <Check width="10" height="10" aria-hidden="true" />
                CONNECTED
                <span className="pay-mock">MOCK</span>
              </span>
            </div>
            <div className="pay-method">
              <span className="pay-method-ico" aria-hidden="true">
                <WalletIcon width="21" height="21" />
              </span>
              <div className="pay-method-body">
                <span className="pay-method-name">PayPal</span>
                <a
                  className="fd-btn fd-btn-ghost pay-btn-sm"
                  href="https://www.sandbox.paypal.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Manage on PayPal
                </a>
              </div>
            </div>
            <p className="pay-note">VaultLance never sees your card or PayPal password.</p>
          </section>

          <StepsCard
            title="How holds work"
            steps={[
              "You authorize the amount — nothing is charged yet",
              "The freelancer delivers, and the audit runs",
              "Approve and capture, or reject and void",
              "Files unlock the moment the capture lands",
            ]}
            note="Nothing is charged until you approve. Rejecting releases the hold."
          />

          <section className="pay-card" aria-labelledby={`${tabsId}-help`}>
            <h2 id={`${tabsId}-help`} className="pay-card-h">
              Need help?
            </h2>
            <p className="pay-note">Questions about a payment?</p>
            <a
              className="fd-btn fd-btn-secondary pay-btn-sm"
              href="mailto:support@vaultlance.example?subject=Payment%20question"
            >
              Contact support
            </a>
            <p className="pay-note fd-dim">support@vaultlance.example is a placeholder address.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
