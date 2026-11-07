/* EarningsGrid.tsx — the Earnings page's table: one row per event, joined to
   its vault, with the payout state and the money that came of it.

   Same AG Grid theme as the Overview ledger. Columns hold their widths until
   the grid narrows, then PayPal ID goes, then the vault name; sizeColumnsToFit
   keeps the row inside the card at every width, so there is never a horizontal
   scrollbar. The page owns the pinned TOTAL PAID footer under it. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import type { ColDef, GridApi } from "ag-grid-community";
import { Copy, VaultGlyph } from "../dashboard/icons";
import { useToast } from "../shared/Toasts";
import { formatCents } from "../../lib/fees";
import { formatRelative, toMs } from "../../lib/formatRelative";
import { PHASE_LABEL } from "../../lib/freelancerPhase";
import { EVENT_DOT, EVENT_LABEL, type EarningsRow } from "../../lib/earnings";
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

const STATUS: Record<string, { label: string; tone: string }> = {
  paid: { label: "PAID", tone: "success" },
  pending: { label: "PENDING", tone: "brass" },
  failed: { label: "FAILED", tone: "danger" },
};

interface Props {
  rows: EarningsRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenVault: (vaultId: string) => void;
  emptyHint: string;
}

export function EarningsGrid({ rows, loading, error, onRetry, onOpenVault, emptyHint }: Props) {
  const toast = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GridApi | null>(null);
  const [pop, setPop] = useState<{ row: EarningsRow; x: number; y: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  /* PayPal ID hides first, then the vault name: 144+233+144+144+144 fixed plus
     the two flex columns' 120px floors is 1049, so those are the two edges. */
  const fit = useCallback(() => {
    const api = apiRef.current;
    const el = wrapRef.current;
    if (!api || !el) return;
    const w = el.clientWidth;
    /* under 1024 the page keeps only Time, Event and Amount */
    const roomy = window.innerWidth >= 1024;
    api.setColumnsVisible(["paypalId"], roomy && w >= 1050);
    api.setColumnsVisible(["vaultProject"], roomy && w >= 930);
    api.setColumnsVisible(["phase"], roomy);
    api.setColumnsVisible(["payoutStatus"], roomy);
    api.sizeColumnsToFit();
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
    /* the popover takes focus while it is open and hands it back on close */
    const before = document.activeElement as HTMLElement | null;
    popRef.current?.querySelector<HTMLElement>(".fd-btn-primary")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      before?.focus?.();
    };
  }, [pop]);

  const columns = useMemo<ColDef<EarningsRow>[]>(
    () => [
      {
        headerName: "TIME",
        field: "at",
        width: 144,
        cellRenderer: (p: { value: string }) => (
          <span title={fullTime(p.value)}>{formatRelative(p.value)}</span>
        ),
      },
      {
        headerName: "EVENT",
        field: "type",
        width: 233,
        cellRenderer: (p: { value: EarningsRow["type"] }) => (
          <span className="fd-event" title={p.value}>
            <span className="fd-dot" style={{ background: EVENT_DOT[p.value] ?? "var(--hero-steel)" }} aria-hidden="true" />
            {EVENT_LABEL[p.value] ?? p.value}
          </span>
        ),
      },
      {
        headerName: "VAULT",
        field: "vaultProject",
        flex: 1.618,
        minWidth: 120,
      },
      {
        headerName: "PHASE",
        field: "phase",
        width: 144,
        valueGetter: (p) => (p.data?.phase ? PHASE_LABEL[p.data.phase] : "—"),
      },
      {
        headerName: "PAYOUT STATUS",
        field: "payoutStatus",
        width: 144,
        cellRenderer: (p: { data?: EarningsRow }) => {
          const status = p.data?.payoutStatus;
          const meta = status ? STATUS[status] : null;
          if (!meta) return <span className="fd-dim">—</span>;
          return (
            <span className="fd-status" data-tone={meta.tone}>
              {meta.label}
            </span>
          );
        },
      },
      {
        headerName: "AMOUNT",
        field: "amountCents",
        width: 144,
        minWidth: 144,
        type: "rightAligned",
        cellClass: "fd-cell-num",
        cellRenderer: (p: { value?: number }) =>
          typeof p.value === "number" ? formatCents(p.value) : "—",
      },
      {
        headerName: "PAYPAL ID",
        field: "paypalId",
        flex: 1,
        minWidth: 120,
        cellRenderer: (p: { value?: string }) => {
          if (!p.value) return <span className="fd-dim">—</span>;
          return (
            <button
              type="button"
              className="fd-copy"
              title="Copy PayPal ID"
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard
                  ?.writeText(p.value!)
                  .then(() => toast({ message: "PayPal ID copied.", tone: "success" }));
              }}
            >
              <span className="fd-mono" data-ellipsis>{p.value}</span>
              <Copy width="12" height="12" aria-hidden="true" />
            </button>
          );
        },
      },
    ],
    [toast]
  );

  const empty = !loading && !error && rows.length === 0;

  return (
    <div className="fd-earn-grid-shell">
      <div className="fd-earn-grid-main">
      {loading ? (
        <div className="fd-grid-skel" aria-busy="true" aria-label="Loading earnings">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <span key={i} className="fd-skel fd-skel-grid-row" style={{ animationDelay: `${i * 61.8}ms` }} />
          ))}
        </div>
      ) : error ? (
        <div className="fd-inline-error" role="alert">
          <p className="fd-inline-error-text">{error}</p>
          <button type="button" className="fd-btn fd-btn-primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : empty ? (
        <div className="fd-empty">
          <span className="fd-empty-mark" aria-hidden="true">
            <VaultGlyph width="144" height="144" />
          </span>
          <p className="fd-empty-text">{emptyHint}</p>
        </div>
      ) : (
        <div className="fd-grid ag-theme-quartz-dark" ref={wrapRef}>
          <AgGridReact<EarningsRow>
            theme={gridTheme}
            rowData={rows}
            columnDefs={columns}
            headerHeight={34}
            rowHeight={34}
            tooltipShowDelay={200}
            getRowId={(p) => p.data?.id ?? ""}
            onGridReady={(p) => {
              apiRef.current = p.api;
              fit();
            }}
            onRowClicked={(p) => {
              if (!p.data) return;
              const shell = wrapRef.current?.parentElement?.getBoundingClientRect();
              const me = p.event as MouseEvent | undefined;
              const x = me?.clientX ?? 0;
              const y = me?.clientY ?? 0;
              setPop({
                row: p.data,
                x: Math.max(8, Math.min(x - (shell?.left ?? 0), (shell?.width ?? 400) - 268)),
                y: Math.max(8, y - (shell?.top ?? 0)),
              });
            }}
            /* Enter or Space on a focused cell opens the same popover */
            onCellKeyDown={(p) => {
              const key = (p.event as KeyboardEvent | undefined)?.key;
              if ((key !== "Enter" && key !== " ") || !p.data) return;
              const cell = ((p.event?.target as HTMLElement | null) ?? null)?.closest(".ag-cell");
              const shell = wrapRef.current?.parentElement?.getBoundingClientRect();
              const box = cell?.getBoundingClientRect();
              setPop({
                row: p.data,
                x: Math.max(8, Math.min((box?.left ?? 0) - (shell?.left ?? 0), (shell?.width ?? 400) - 268)),
                y: Math.max(8, (box?.bottom ?? 0) - (shell?.top ?? 0)),
              });
            }}
          />
        </div>
      )}
      </div>

      {pop && (
        <>
          <div className="fd-pop-scrim" onClick={() => setPop(null)} />
          <div
            ref={popRef}
            className="fd-pop"
            role="dialog"
            aria-label={`${EVENT_LABEL[pop.row.type]} details`}
            style={{ left: Math.max(8, pop.x), top: Math.max(8, pop.y) }}
          >
            <p className="fd-pop-eyebrow">{EVENT_LABEL[pop.row.type]}</p>
            <p className="fd-pop-title">{pop.row.vaultProject}</p>
            <dl className="fd-pop-list">
              <div>
                <dt>WHEN</dt>
                <dd>{fullTime(pop.row.at)}</dd>
              </div>
              <div>
                <dt>AMOUNT</dt>
                <dd>{typeof pop.row.amountCents === "number" ? formatCents(pop.row.amountCents) : "—"}</dd>
              </div>
              <div>
                <dt>PAYOUT</dt>
                <dd>{pop.row.payoutStatus ? STATUS[pop.row.payoutStatus]?.label ?? "—" : "—"}</dd>
              </div>
            </dl>
            <div className="fd-pop-actions">
              <button
                type="button"
                className="fd-btn fd-btn-primary"
                onClick={() => {
                  const id = pop.row.vaultId;
                  setPop(null);
                  onOpenVault(id);
                }}
              >
                View vault
              </button>
              <button type="button" className="fd-btn fd-btn-ghost" onClick={() => setPop(null)}>
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
