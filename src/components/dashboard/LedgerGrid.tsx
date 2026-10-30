/* LedgerGrid.tsx — the vault's own paper trail in AG Grid Community. Compact,
   34px rows, mono headers, no default blue anywhere: every colour comes from
   the theme params or from the tokens in dashboard.css. New events slide in at
   the top and flash brass; a row click opens its details. */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
import type { LedgerEvent, Vault } from "../../lib/api";
import { Copy } from "./icons";
import { useToast } from "./Toasts";
import { useDashData } from "./data";

ModuleRegistry.registerModules([AllCommunityModule]);

const body = "var(--hero-font-body)";

const gridTheme = themeQuartz.withParams({
  backgroundColor: "transparent",
  foregroundColor: "#0e1520",
  borderColor: "rgba(138, 149, 161, 0.4)",
  headerBackgroundColor: "transparent",
  headerTextColor: "#4b5663",
  chromeBackgroundColor: "transparent",
  accentColor: "#12a5b5",
  fontFamily: body,
  fontSize: "14px",
  headerHeight: 34,
  rowHeight: 34,
  cellHorizontalPadding: 8,
  wrapperBorder: false,
});

const TYPE_DOT: Record<LedgerEvent["type"], string> = {
  "PAYMENT.AUTHORIZED": "var(--hero-brass)",
  "PAYMENT.CAPTURED": "var(--hero-success)",
  "PAYMENT.VOIDED": "var(--dash-danger)",
  "FILES.UNLOCKED": "var(--hero-teal)",
  "AUDIT.COMPLETED": "var(--hero-slate)",
};

const STATUS_LABEL: Record<Vault["status"], string> = {
  awaiting_payment: "Awaiting payment",
  held: "Held",
  audited: "Audited",
  unlocked: "Unlocked",
  voided: "Voided",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const fullTime = (ts: number) =>
  new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function duration(ms: number): string {
  if (ms <= 0) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

interface Row extends LedgerEvent {
  project: string;
  status: Vault["status"];
  sincePrevious: number | null;
}

export function LedgerGrid({ full = false, events, vaults }: { full?: boolean; events: LedgerEvent[]; vaults: Vault[] }) {
  const toast = useToast();
  const { latestEvent } = useDashData();
  const wrap = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<{ row: Row; x: number; y: number } | null>(null);
  const [filter, setFilter] = useState("");

  const rows = useMemo<Row[]>(() => {
    const projects = new Map(vaults.map((v) => [v.id, v.project]));
    const statuses = new Map(vaults.map((v) => [v.id, v.status]));
    const sorted = [...events].sort((a, b) => b.ts - a.ts);
    return sorted.map((e, i) => {
      /* the gap to this vault's previous event, for the full page's Duration */
      const prior = sorted.slice(i + 1).find((x) => x.vaultId === e.vaultId);
      return {
        ...e,
        project: projects.get(e.vaultId) ?? "Unknown vault",
        status: statuses.get(e.vaultId) ?? "awaiting_payment",
        sincePrevious: prior ? e.ts - prior.ts : null,
      };
    });
  }, [events, vaults]);

  /* a live event: flash its row for a second, on the grid's own DOM */
  useEffect(() => {
    if (!latestEvent) return;
    const host = wrap.current;
    if (!host) return;
    const row = host.querySelector<HTMLElement>(`.ag-row[row-id="${latestEvent.id}"]`);
    if (!row) return;
    row.classList.add("dash-row-new");
    const timer = window.setTimeout(() => row.classList.remove("dash-row-new"), 1000);
    return () => window.clearTimeout(timer);
  }, [latestEvent, rows]);

  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast({ message: `Copied ${id}` });
    } catch {
      toast({ message: "Could not copy the PayPal ID.", tone: "error" });
    }
  };

  const columns = useMemo<ColDef<Row>[]>(() => {
    /* compact (the lower band is 482px wide) keeps four columns: time, event,
       amount and the PayPal id. The vault name is one click away in the row's
       details, and the full-page route has room for it. */
    const base: ColDef<Row>[] = [
      {
        headerName: "Time",
        field: "ts",
        width: 72,
        valueFormatter: (p) => (p.data ? relativeTime(p.data.ts) : ""),
        tooltipValueGetter: (p) => (p.data ? fullTime(p.data.ts) : ""),
        comparator: (a: number, b: number) => a - b,
      },
      {
        headerName: "Event",
        field: "type",
        flex: 1,
        minWidth: 144,
        cellRenderer: (p: ICellRendererParams<Row>) =>
          p.data ? (
            <span className="dash-ledger-event">
              <span className="dash-ledger-dot" style={{ background: TYPE_DOT[p.data.type] }} aria-hidden="true" />
              <span className="dash-ledger-type">{p.data.type}</span>
            </span>
          ) : null,
      },
      {
        headerName: "Amount",
        field: "amountUSD",
        width: 72,
        type: "rightAligned",
        valueFormatter: (p) => (p.data?.amountUSD ? usd.format(p.data.amountUSD) : "—"),
      },
      {
        headerName: "PayPal ID",
        field: "paypalId",
        width: 131,
        cellRenderer: (p: ICellRendererParams<Row>) =>
          p.data?.paypalId ? (
            <span className="dash-ledger-pp">
              <span className="dash-ledger-id">{p.data.paypalId}</span>
              <button
                type="button"
                className="dash-copy"
                aria-label={`Copy PayPal ID ${p.data.paypalId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void copy(p.data!.paypalId!);
                }}
              >
                <Copy width="13" height="13" />
              </button>
            </span>
          ) : (
            <span className="dim">—</span>
          ),
      },
    ];

    if (!full) return base;

    return [
      base[0],
      base[1],
      { headerName: "Vault", field: "project", width: 144 },
      base[2],
      base[3],
      { headerName: "Status", field: "status", width: 144, valueFormatter: (p) => (p.data ? STATUS_LABEL[p.data.status] : "") },
      {
        headerName: "Duration",
        field: "sincePrevious",
        width: 89,
        valueFormatter: (p) => (p.data?.sincePrevious ? duration(p.data.sincePrevious) : "—"),
      },
    ];
    /* copy is stable enough: it only shows a toast */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  /* the popover is portalled: the card's backdrop-filter would otherwise make
     it the containing block and the card's overflow would clip it */
  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".dash-pop")) return;
      setPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPop(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [pop]);

  const onRowClicked = (e: RowClickedEvent<Row>) => {
    if (!e.data || !e.event) return;
    const mouse = e.event as MouseEvent;
    setPop({ row: e.data, x: mouse.clientX, y: mouse.clientY });
  };

  return (
    <div className="dash-ledger-body">
      {full && (
        <div className="dash-ledger-filter">
          <input
            className="dash-search-input"
            type="search"
            placeholder="Filter events"
            aria-label="Filter events"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}

      <div className="dash-grid" ref={wrap} role="region" aria-label="Vault ledger">
        {rows.length === 0 ? (
          <p className="dash-grid-empty">No events yet.</p>
        ) : (
          <AgGridReact<Row>
            theme={gridTheme}
            rowData={rows}
            columnDefs={columns}
            getRowId={(p) => p.data.id}
            onRowClicked={onRowClicked}
            quickFilterText={full ? filter : undefined}
            tooltipShowDelay={200}
            ensureDomOrder
            rowHeight={34}
            headerHeight={34}
          />
        )}
      </div>

      {pop &&
        createPortal(
          <div
            className="dash-pop"
            role="dialog"
            aria-label="Event details"
            style={{
              left: Math.max(13, Math.min(pop.x, window.innerWidth - 271)),
              top: Math.max(13, Math.min(pop.y + 8, window.innerHeight - 250)),
            }}
          >
            <p className="dash-eyebrow">
              {/* the same dot the grid draws for this type, not the brass
                  eyebrow mark: one event, one colour, wherever it appears */}
              <span className="dash-ledger-dot" style={{ background: TYPE_DOT[pop.row.type] }} aria-hidden="true" />
              {pop.row.type}
            </p>
            <p className="dash-pop-line">
              <span className="dim">Vault</span> {pop.row.project}
            </p>
            <p className="dash-pop-line">
              <span className="dim">When</span> {fullTime(pop.row.ts)}
            </p>
            <p className="dash-pop-line">
              <span className="dim">Amount</span> {pop.row.amountUSD ? usd.format(pop.row.amountUSD) : "—"}
            </p>
            <p className="dash-pop-line">
              <span className="dim">PayPal</span> <span className="dash-mono">{pop.row.paypalId ?? "—"}</span>
            </p>
            <p className="dash-pop-note">{pop.row.label}</p>
            <button type="button" className="dash-btn dash-btn-ghost dash-pop-close" onClick={() => setPop(null)}>
              Close
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
