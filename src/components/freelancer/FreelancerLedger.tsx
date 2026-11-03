/* FreelancerLedger.tsx — the earnings grid. AG Grid Community, compact, themed
   with the dashboard's own tokens so nothing defaults to AG Grid's blue.

   Money in the grid is the net figure where an event moved money; the gross the
   client funded is on the details drawer instead. */

import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import type { ColDef, RowClickedEvent } from "ag-grid-community";
import { formatCents } from "../../lib/fees";
import { phaseOfVault } from "./mockApi";
import type { FreelancerEvent, FreelancerVault } from "./mockApi";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  backgroundColor: "transparent",
  foregroundColor: "#0e1520",
  borderColor: "rgba(138,149,161,0.32)",
  headerBackgroundColor: "rgba(255,255,255,0.28)",
  headerTextColor: "#4b5663",
  headerFontSize: 11,
  fontFamily: "inherit",
  fontSize: 12,
  rowHeight: 34,
  headerHeight: 34,
  oddRowBackgroundColor: "rgba(255,255,255,0.14)",
  selectedRowBackgroundColor: "rgba(18,165,181,0.10)",
});

const rel = (ts: number) => {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const full = (ts: number) =>
  new Date(ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

interface Row {
  id: string;
  ts: number;
  when: string;
  event: string;
  vault: string;
  amount: number | null;
  paypal: string;
  phase: string;
  payout: string;
}

export function FreelancerLedger({
  events,
  vaults,
  detail = false,
}: {
  events: FreelancerEvent[];
  vaults: FreelancerVault[];
  /** the Earnings page adds phase and payout columns */
  detail?: boolean;
}) {
  const [picked, setPicked] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(vaults.map((v) => [v.id, v]));
    return events.map((e) => {
      const v = byId.get(e.vaultId);
      return {
        id: e.id,
        ts: e.ts,
        when: rel(e.ts),
        event: e.type,
        vault: v?.project ?? e.vaultId,
        amount: e.amountCents ?? null,
        paypal: e.paypalId ?? "—",
        phase: v ? phaseOfVault(v).replace("_", " ") : "—",
        payout: v?.payoutStatus ?? "—",
      };
    });
  }, [events, vaults]);

  const columns = useMemo<ColDef<Row>[]>(() => {
    const base: ColDef<Row>[] = [
      { field: "when", headerName: "TIME", width: 96, tooltipValueGetter: (p) => full(p.data?.ts ?? 0) },
      { field: "event", headerName: "EVENT", flex: 2, minWidth: 168 },
      { field: "vault", headerName: "VAULT", flex: 2, minWidth: 140 },
      {
        field: "amount",
        headerName: "AMOUNT",
        width: 110,
        valueFormatter: (p) => (p.value == null ? "—" : formatCents(Number(p.value))),
      },
      { field: "paypal", headerName: "PAYPAL ID", width: 172, cellClass: "fd-mono-cell" },
    ];
    if (detail) {
      base.push(
        { field: "phase", headerName: "PHASE", width: 128 },
        { field: "payout", headerName: "PAYOUT", width: 104 }
      );
    }
    return base;
  }, [detail]);

  return (
    <div className="fd-grid">
      <AgGridReact<Row>
        theme={theme}
        rowData={rows}
        columnDefs={columns}
        domLayout="autoHeight"
        suppressCellFocus
        onRowClicked={(e: RowClickedEvent<Row>) => setPicked(e.data ?? null)}
      />

      {picked && (
        <div className="fd-pop" role="status">
          <p className="fd-pop-title">{picked.event}</p>
          <p className="fd-pop-line">
            {picked.vault} · {picked.when}
          </p>
          <p className="fd-pop-line fd-mono">
            {picked.amount == null ? "no money moved" : formatCents(picked.amount)} · {picked.paypal}
          </p>
          <button type="button" className="fd-btn fd-btn-ghost" onClick={() => setPicked(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
