/* FreelancerLedger.tsx — the freelancer's paper trail, in AG Grid Community
   with the client ledger's theme: 34px rows, mono headers, no default blue, and
   every colour from a token. A new event slides in at the top and flashes
   brass, because the point of the card is to be noticed when it changes. */

import { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import type { ColDef } from "ag-grid-community";
import { Copy } from "../dashboard/icons";
import { useToast } from "../shared/Toasts";
import { formatCents } from "../../lib/fees";
import type { FreelancerEvent } from "./mockApi";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  backgroundColor: "transparent",
  foregroundColor: "#0e1520",
  borderColor: "rgba(138, 149, 161, 0.4)",
  headerBackgroundColor: "transparent",
  headerTextColor: "#4b5663",
  chromeBackgroundColor: "transparent",
  accentColor: "#12a5b5",
  fontFamily: "var(--hero-font-body)",
  fontSize: "14px",
  headerHeight: 34,
  rowHeight: 34,
  cellHorizontalPadding: 8,
  wrapperBorder: false,
});

const DOT: Record<string, string> = {
  "PAYMENT.AUTHORIZED": "var(--hero-brass)",
  "PAYMENT.CAPTURED": "var(--hero-success)",
  "PAYMENT.VOIDED": "#c4453d",
  "FILES.SUBMITTED": "var(--hero-teal)",
  "FILES.UPLOADED": "var(--hero-teal)",
  "AUDIT.COMPLETED": "var(--hero-slate)",
  "PAYOUT.SENT": "var(--hero-success)",
  "PAYOUT.FAILED": "#c4453d",
  "CLIENT.INVITED": "var(--hero-brass)",
  "VAULT.CREATED": "var(--hero-slate)",
};

export const fullTime = (ts: number) =>
  new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function EventDot({ type }: { type: string }) {
  return <span className="fd-dot" style={{ background: DOT[type] ?? "var(--hero-steel)" }} aria-hidden="true" />;
}

export function FreelancerLedger({ events, loading }: { events: FreelancerEvent[]; loading: boolean }) {
  const toast = useToast();
  const gridApi = useRef<{ ensureIndexVisible: (i: number) => void } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const seen = useRef<string | null>(null);

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
        width: 104,
        valueFormatter: (p) => relativeTime(p.value as number),
        tooltipValueGetter: (p) => fullTime(p.value as number),
      },
      {
        headerName: "EVENT",
        field: "type",
        flex: 1,
        minWidth: 150,
        cellRenderer: (p: { value: string }) => (
          <span className="fd-event">
            <EventDot type={p.value} />
            {p.value}
          </span>
        ),
      },
      { headerName: "VAULT", field: "vaultProject", width: 132 },
      {
        headerName: "AMOUNT",
        field: "amountCents",
        width: 104,
        valueFormatter: (p) => (typeof p.value === "number" ? formatCents(p.value) : "—"),
        cellClass: "fd-cell-num",
      },
      {
        headerName: "PAYPAL ID",
        field: "paypalId",
        width: 168,
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
              <span className="fd-mono">{p.value}</span>
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
    <div className="fd-grid ag-theme-quartz-dark">
      <AgGridReact<FreelancerEvent>
        theme={gridTheme}
        rowData={events}
        columnDefs={columns}
        headerHeight={34}
        rowHeight={34}
        suppressCellFocus={false}
        getRowId={(p) => p.data?.id ?? ""}
        getRowClass={(p) => (p.data?.id === flashId ? "fd-row-new" : undefined)}
        onGridReady={(p) => {
          gridApi.current = p.api as unknown as { ensureIndexVisible: (i: number) => void };
        }}
        onRowClicked={(p) =>
          p.data && toast({ message: `${p.data.type} · ${p.data.vaultProject}`, tone: "info" })
        }
      />
    </div>
  );
}
