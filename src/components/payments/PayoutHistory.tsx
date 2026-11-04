/* PayoutHistory.tsx — every payout attempt, with the fee split in the open.

   The grid is the ledger's grid: same AG theme, same mono headers, same
   hairlines. It is taller here (55px a row) because each row carries a status
   that sometimes has a sentence under it, and a retry beside it.

   Under 1280 the two fee columns leave the row and live in the popover instead;
   the row never scrolls sideways at any width the dashboard is used at. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import type { ColDef, GridApi } from "ag-grid-community";
import { Copy, Download, VaultGlyph } from "../dashboard/icons";
import { Refresh } from "./icons";
import { useToast } from "../shared/Toasts";
import { formatCents } from "../../lib/fees";
import { gridTheme } from "../freelancer/gridTheme";
import type { Payout } from "./paymentsModel";

ModuleRegistry.registerModules([AllCommunityModule]);

const STATUS_STYLE: Record<Payout["status"], { label: string; tone: string }> = {
  paid: { label: "PAID", tone: "ok" },
  pending: { label: "PENDING", tone: "brass" },
  failed: { label: "FAILED", tone: "danger" },
};

type Filter = "all" | "paid" | "pending" | "failed";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "ALL" },
  { key: "paid", label: "PAID" },
  { key: "pending", label: "PENDING" },
  { key: "failed", label: "FAILED" },
];

const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();

const fullDate = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export interface PayoutHistoryProps {
  payouts: Payout[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onOpenVault: (vaultId: string) => void;
  onRetryPayout: (vaultId: string) => Promise<void>;
  onDownloadReceipt: (payout: Payout) => void;
  /** the vault that just turned paid, for the one green sweep */
  justPaid: string | null;
}

export function PayoutHistory({
  payouts,
  loading,
  error,
  onReload,
  onOpenVault,
  onRetryPayout,
  onDownloadReceipt,
  justPaid,
}: PayoutHistoryProps) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [pop, setPop] = useState<{ row: Payout; x: number; y: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1280);

  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GridApi | null>(null);

  const rows = useMemo(
    () => (filter === "all" ? payouts : payouts.filter((p) => p.status === filter)),
    [payouts, filter]
  );
  const totalNet = useMemo(
    () => rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.netCents, 0),
    [rows]
  );

  /* the fee columns leave the row under 1280; they are in the popover either way */
  const fit = useCallback(() => {
    const el = wrapRef.current;
    const api = apiRef.current;
    if (!el) return;
    const narrow = window.innerWidth < 1280;
    setWide(!narrow);
    if (!api) return;
    api.setColumnsVisible(["vlFee", "ppFee"], !narrow);
    api.setColumnsVisible(["paypalId"], el.clientWidth >= 700);
    /* the two flex columns absorb whatever the fixed ones leave, so the row
       always fits its card without a horizontal scrollbar */
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    if (!pop) return;
    const close = () => setPop(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    const before = document.activeElement as HTMLElement | null;
    popRef.current?.querySelector<HTMLElement>(".fd-btn-primary")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      before?.focus?.();
    };
  }, [pop]);

  const openAt = useCallback((row: Payout, clientX: number, clientY: number) => {
    const box = wrapRef.current?.parentElement?.getBoundingClientRect();
    setPop({
      row,
      x: Math.max(8, Math.min(clientX - (box?.left ?? 0), (box?.width ?? 400) - 268)),
      y: Math.max(8, clientY - (box?.top ?? 0)),
    });
  }, []);

  const retry = async (row: Payout) => {
    setBusyId(row.vaultId);
    try {
      await onRetryPayout(row.vaultId);
      toast({ message: "Payout sent. It arrives in a moment.", tone: "success" });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Couldn’t retry the payout.", tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo<ColDef<Payout>[]>(
    () => [
      {
        headerName: "DATE",
        field: "createdAt",
        width: 76,
        minWidth: 76,
        valueFormatter: (p) => (typeof p.value === "number" ? fullDate(p.value) : ""),
        cellRenderer: (p: { value?: number }) => (typeof p.value === "number" ? shortDate(p.value) : "—"),
      },
      {
        headerName: "VAULT",
        field: "project",
        flex: 1.618,
        minWidth: 89,
        cellRenderer: (p: { value?: string }) => <span title={p.value}>{p.value}</span>,
      },
      {
        headerName: "GROSS",
        field: "grossCents",
        width: 72,
        minWidth: 72,
        type: "rightAligned",
        cellClass: "fd-cell-num",
        cellRenderer: (p: { value?: number }) => formatCents(p.value ?? 0),
      },
      {
        colId: "vlFee",
        headerName: "VL FEE",
        field: "vaultlanceFeeCents",
        width: 64,
        minWidth: 64,
        type: "rightAligned",
        cellClass: "fd-cell-num pay-fee-cell",
        cellRenderer: (p: { value?: number }) => `−${formatCents(p.value ?? 0)}`,
      },
      {
        colId: "ppFee",
        headerName: "PP FEE",
        field: "paypalFeeCents",
        width: 64,
        minWidth: 64,
        type: "rightAligned",
        cellClass: "fd-cell-num pay-fee-cell",
        cellRenderer: (p: { value?: number }) => `−${formatCents(p.value ?? 0)}`,
      },
      {
        headerName: "NET",
        field: "netCents",
        width: 76,
        minWidth: 76,
        type: "rightAligned",
        cellClass: "fd-cell-num pay-net",
        cellRenderer: (p: { value?: number }) => <strong>{formatCents(p.value ?? 0)}</strong>,
      },
      {
        headerName: "STATUS",
        field: "status",
        width: 144,
        minWidth: 144,
        cellClass: "pay-status-cell",
        cellRenderer: (p: { data?: Payout }) => {
          if (!p.data) return null;
          const meta = STATUS_STYLE[p.data.status];
          const failed = p.data.status === "failed";
          return (
            <div className="pay-status">
              <div className="pay-status-row">
                <span className="pay-chip" data-tone={meta.tone}>
                  {meta.label}
                </span>
                {failed && (
                  <button
                    type="button"
                    className="fd-btn fd-btn-secondary pay-retry"
                    aria-label={`Retry payout for ${p.data.project}`}
                    title="Retry payout"
                    disabled={busyId === p.data.vaultId}
                    onClick={(e) => {
                      e.stopPropagation();
                      void retry(p.data!);
                    }}
                  >
                    {busyId === p.data.vaultId ? (
                      <span className="fd-spin" aria-hidden="true" />
                    ) : (
                      <Refresh width="11" height="11" aria-hidden="true" />
                    )}
                    Retry
                  </button>
                )}
              </div>
              {failed && (
                <span className="pay-reason" title={p.data.failureReason}>
                  {p.data.failureReason}
                </span>
              )}
            </div>
          );
        },
      },
      {
        colId: "paypalId",
        headerName: "PAYPAL ID",
        field: "paypalPayoutId",
        flex: 1,
        minWidth: 96,
        cellRenderer: (p: { value?: string }) => {
          if (!p.value) return <span className="fd-dim">—</span>;
          return (
            <button
              type="button"
              className="fd-copy"
              title={`Copy ${p.value}`}
              aria-label={`Copy PayPal payout ID ${p.value}`}
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard
                  ?.writeText(p.value!)
                  .then(() => toast({ message: "PayPal ID copied.", tone: "success" }));
              }}
            >
              <span className="fd-mono">{p.value}</span>
              <Copy width="12" height="12" aria-hidden="true" />
            </button>
          );
        },
      },
    ],
    // retry and toast are stable enough for a memo keyed on the busy row
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId, toast]
  );

  const empty = !loading && !error && rows.length === 0;
  /* a definite height: AG paints inside it, and six rows is as tall as it gets */
  const gridH = 34 + Math.min(Math.max(rows.length, 1), 6) * 55;

  return (
    <section className="pay-card pay-history" aria-labelledby="pay-history-h">
      <div className="pay-card-head">
        <h2 id="pay-history-h" className="pay-card-h">
          Payout history
        </h2>
        <div className="pay-chips" role="group" aria-label="Filter payouts">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className="fd-earn-seg-item"
              data-on={filter === f.key ? "true" : undefined}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pay-grid-wrap">
        {loading ? (
          <div className="pay-grid-skel" aria-busy="true" aria-label="Loading payouts">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="fd-skel pay-grid-skel-row" style={{ animationDelay: `${i * 61.8}ms` }} />
            ))}
          </div>
        ) : error ? (
          <div className="pay-error" role="alert">
            <p className="pay-error-text">{error}</p>
            <button type="button" className="fd-btn fd-btn-primary pay-btn-sm" onClick={onReload}>
              Retry
            </button>
          </div>
        ) : empty ? (
          <div className="fd-empty pay-empty">
            <span className="fd-empty-mark" aria-hidden="true">
              <VaultGlyph width="144" height="144" />
            </span>
            <p className="fd-empty-text">
              {payouts.length === 0 ? "No payouts yet. Paid vaults appear here." : "No payouts in this filter."}
            </p>
          </div>
        ) : (
          <div
            className="fd-grid pay-grid ag-theme-quartz-dark"
            ref={wrapRef}
            style={{ height: gridH }}
            role="group"
            aria-label="Payout history"
          >
            <AgGridReact<Payout>
              theme={gridTheme}
              rowData={rows}
              columnDefs={columns}
              headerHeight={34}
              rowHeight={55}
              getRowId={(p) => p.data?.id ?? ""}
              getRowClass={(p) =>
                p.data && p.data.vaultId === justPaid ? "pay-row-just-paid" : undefined
              }
              onGridReady={(p) => {
                apiRef.current = p.api;
                fit();
              }}
              onRowClicked={(p) => {
                if (!p.data) return;
                /* a click that landed on the row's own button (copy, retry,
                   download) is the button's, not the row's */
                const target = (p.event?.target as HTMLElement | null) ?? null;
                if (target?.closest("button")) return;
                const me = p.event as MouseEvent | undefined;
                openAt(p.data, me?.clientX ?? 0, me?.clientY ?? 0);
              }}
              onCellKeyDown={(p) => {
                const key = (p.event as KeyboardEvent | undefined)?.key;
                if ((key !== "Enter" && key !== " ") || !p.data) return;
                const cell = ((p.event?.target as HTMLElement | null) ?? null)?.closest(".ag-cell");
                const box = cell?.getBoundingClientRect();
                openAt(p.data, box?.left ?? 0, (box?.bottom ?? 0) + 4);
              }}
            />
          </div>
        )}

        {/* under 768 the grid becomes these 89px cards */}
        {!loading && !error && rows.length > 0 && (
          <ul className="pay-mlist" aria-label="Payouts">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="pay-mcard"
                  onClick={(e) => openAt(row, e.clientX, e.clientY)}
                >
                  <span className="pay-mcard-top">
                    <span className="pay-mcard-title">{row.project}</span>
                    <span className="pay-mcard-num">{formatCents(row.netCents)}</span>
                  </span>
                  <span className="pay-mcard-bot">
                    <span className="pay-chip" data-tone={STATUS_STYLE[row.status].tone}>
                      {STATUS_STYLE[row.status].label}
                    </span>
                    <span>{shortDate(row.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!error && (
        <div className="pay-total">
          <span className="pay-total-label">
            TOTAL NET {filter !== "all" && <span className="fd-dim">· {filter.toUpperCase()}</span>}
          </span>
          <span className="pay-total-num">{loading ? "—" : formatCents(totalNet)}</span>
        </div>
      )}

      {pop && (
        <>
          <div className="pay-pop-scrim" onClick={() => setPop(null)} />
          <div
            ref={popRef}
            className="pay-pop"
            role="dialog"
            aria-label={`${pop.row.project} payout`}
            style={{ left: Math.max(8, pop.x), top: Math.max(8, pop.y) }}
          >
            <p className="pay-pop-eyebrow">{STATUS_STYLE[pop.row.status].label}</p>
            <p className="pay-pop-title">{pop.row.project}</p>
            <dl className="pay-pop-list">
              <div>
                <dt>ATTEMPTED</dt>
                <dd>{fullDate(pop.row.createdAt)}</dd>
              </div>
              {pop.row.paidAt && (
                <div>
                  <dt>ARRIVED</dt>
                  <dd>{fullDate(pop.row.paidAt)}</dd>
                </div>
              )}
              <div>
                <dt>GROSS</dt>
                <dd>{formatCents(pop.row.grossCents)}</dd>
              </div>
              <div>
                <dt>VAULTLANCE FEE</dt>
                <dd>−{formatCents(pop.row.vaultlanceFeeCents)}</dd>
              </div>
              <div>
                <dt>PAYPAL FEE</dt>
                <dd>−{formatCents(pop.row.paypalFeeCents)}</dd>
              </div>
              <div className="pay-pop-total">
                <dt>NET</dt>
                <dd>{formatCents(pop.row.netCents)}</dd>
              </div>
              {pop.row.paypalPayoutId && (
                <div>
                  <dt>PAYPAL ID</dt>
                  <dd className="fd-mono pay-pop-mono">{pop.row.paypalPayoutId}</dd>
                </div>
              )}
              {pop.row.failureReason && (
                <div>
                  <dt>REASON</dt>
                  <dd>{pop.row.failureReason}</dd>
                </div>
              )}
            </dl>
            <div className="pay-pop-actions">
              <button
                type="button"
                className="fd-btn fd-btn-primary pay-btn-sm"
                onClick={() => {
                  const id = pop.row.vaultId;
                  setPop(null);
                  onOpenVault(id);
                }}
              >
                View vault
              </button>
              {pop.row.status === "paid" && (
                <button
                  type="button"
                  className="fd-btn fd-btn-secondary pay-btn-sm"
                  onClick={() => onDownloadReceipt(pop.row)}
                >
                  <Download width="12" height="12" aria-hidden="true" />
                  Download receipt
                </button>
              )}
              <button type="button" className="fd-btn fd-btn-ghost pay-btn-sm" onClick={() => setPop(null)}>
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {/* the fee columns are only hidden, never gone: the popover carries them */}
      <p className="fd-sr">
        {wide ? "" : "Fee columns are hidden at this width; open a row for the full split."}
      </p>
    </section>
  );
}
