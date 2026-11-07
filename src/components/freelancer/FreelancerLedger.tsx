/* FreelancerLedger.tsx — the freelancer's paper trail, in AG Grid Community
   with the client ledger's theme: 34px rows, mono headers, no default blue, and
   every colour from a token. A new event slides in at the top and flashes
   brass, because the point of the card is to be noticed when it changes. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import type { ColDef, GridApi } from "ag-grid-community";
import { Copy } from "../dashboard/icons";
import { useToast } from "../shared/Toasts";
import { formatCents } from "../../lib/fees";
import { formatRelative, toMs } from "../../lib/formatRelative";
import { EVENT_DOT, EVENT_LABEL } from "../../lib/earnings";
import type { FreelancerEvent, FreelancerEventType } from "./mockApi";
import { gridTheme } from "./gridTheme";

ModuleRegistry.registerModules([AllCommunityModule]);

export const fullTime = (at: string | number) => {
  const ms = toMs(at);
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function EventDot({ type }: { type: string }) {
  return (
    <span
      className="fd-dot"
      style={{ background: EVENT_DOT[type as FreelancerEventType] ?? "var(--hero-steel)" }}
      aria-hidden="true"
    />
  );
}

export function FreelancerLedger({ events, loading }: { events: FreelancerEvent[]; loading: boolean }) {
  const toast = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GridApi | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const seen = useRef<string | null>(null);

  /* flex columns that always fit the card: PayPal ID hides first, then the
     vault name, so the grid never grows a horizontal scrollbar */
  const fit = useCallback(() => {
    const api = apiRef.current;
    const el = wrapRef.current;
    if (!api || !el) return;
    /* at the client ledger's 454px the row reads TIME | EVENT | AMOUNT |
       PAYPAL ID; the vault name is the first to go, so the freelancer's
       compact card matches the client's exactly at that width */
    const w = el.clientWidth;
    api.setColumnsVisible(["vaultProject"], w >= 560);
    api.setColumnsVisible(["paypalId"], w >= 420);
    /* no sizeColumnsToFit: it rescales every column and would starve TIME.
       EVENT is the only flex column, so the fixed widths survive. */
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    const top = events[0];
    if (!top) return;
    if (seen.current && seen.current !== top.id) {
      setFlashId(top.id);
      const timer = window.setTimeout(() => setFlashId(null), 1000);
      return () => window.clearTimeout(timer);
    }
    seen.current = top.id;
  }, [events]);

  const columns = useMemo<ColDef<FreelancerEvent>[]>(
    () => [
      {
        headerName: "TIME",
        field: "at",
        width: 84,
        valueFormatter: (p) => formatRelative(p.value),
        tooltipValueGetter: (p) => fullTime(p.value as string),
      },
      {
        headerName: "EVENT",
        field: "type",
        flex: 1,
        minWidth: 140,
        cellRenderer: (p: { value: FreelancerEventType }) => (
          <span className="fd-event" title={p.value}>
            <EventDot type={p.value} />
            {EVENT_LABEL[p.value] ?? p.value}
          </span>
        ),
        tooltipValueGetter: (p) => (p.value as string) ?? "",
      },
      { headerName: "VAULT", field: "vaultProject", width: 110 },
      {
        headerName: "AMOUNT",
        field: "amountCents",
        width: 96,
        minWidth: 96,
        type: "rightAligned",
        valueFormatter: (p) => (typeof p.value === "number" ? formatCents(p.value) : "—"),
        cellClass: "fd-cell-num",
      },
      {
        headerName: "PAYPAL ID",
        field: "paypalId",
        width: 131,
        cellRenderer: (p: { value?: string }) =>
          p.value ? (
            <button
              type="button"
              className="fd-copy"
              title="Copy PayPal ID"
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard?.writeText(p.value!).then(() => toast({ message: "PayPal ID copied.", tone: "success" }));
              }}
            >
              <span className="fd-mono" data-ellipsis>{p.value}</span>
              <Copy width="12" height="12" aria-hidden="true" />
            </button>
          ) : (
            <span className="fd-dim">—</span>
          ),
      },
    ],
    [toast]
  );

  if (loading) {
    return (
      <div className="fd-grid-skel" aria-busy="true" aria-label="Loading activity">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="fd-skel fd-skel-row" style={{ animationDelay: `${i * 61.8}ms` }} />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="fd-empty-line">No activity yet. Your vaults will write here.</p>;
  }

  return (
    <div className="fd-grid ag-theme-quartz-dark" ref={wrapRef}>
      <AgGridReact<FreelancerEvent>
        theme={gridTheme}
        rowData={events}
        columnDefs={columns}
        headerHeight={34}
        rowHeight={34}
        suppressCellFocus={false}
        tooltipShowDelay={200}
        getRowId={(p) => p.data?.id ?? ""}
        getRowClass={(p) => (p.data?.id === flashId ? "fd-row-new" : undefined)}
        onGridReady={(p) => {
          apiRef.current = p.api;
          fit();
        }}
        onRowClicked={(p) =>
          p.data && toast({ message: `${p.data.type} · ${p.data.vaultProject}`, tone: "info" })
        }
      />
    </div>
  );
}
