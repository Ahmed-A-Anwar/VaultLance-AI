/* EarningsPage.tsx — "/dashboard/ledger" for the freelancer: what has been
   earned, what is waiting, and the paper trail behind both.

   The three summary cards read from lib/earnings, the same selectors the
   Overview's PAID OUT tile uses, so the two numbers are the same number. The
   rows come from the same module, so the CSV and the table cannot disagree. */

import { useEffect, useMemo, useRef, useState } from "react";
import { CountUp } from "../dashboard/CountUp";
import { Download, VaultGlyph } from "../dashboard/icons";
import { useToast } from "../shared/Toasts";
import { formatCents } from "../../lib/fees";
import { formatRelative } from "../../lib/formatRelative";
import { PHASE_LABEL } from "../../lib/freelancerPhase";
import {
  EVENT_DOT,
  EVENT_LABEL,
  buildEarningsRows,
  earningsSummary,
  filterRows,
  toCsv,
  totalPaidCents,
  type EarningsRow,
  type Segment,
} from "../../lib/earnings";
import type { FreelancerEvent, FreelancerVault } from "./mockApi";
import { EarningsGrid, fullTime } from "./EarningsGrid";

/* CountUp walks dollars; formatCents prints cents */
const money = (n: number) => formatCents(Math.round(n * 100));

const SEGMENTS: Array<{ key: Segment; label: string }> = [
  { key: "all", label: "ALL" },
  { key: "payouts", label: "PAYOUTS" },
  { key: "payments", label: "PAYMENTS" },
  { key: "files", label: "FILES" },
];

const FILTER_DEBOUNCE_MS = 236;

interface Props {
  vaults: FreelancerVault[];
  events: FreelancerEvent[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenVault: (vault: FreelancerVault) => void;
}

export function EarningsPage({ vaults, events, loading, error, onRetry, onOpenVault }: Props) {
  const toast = useToast();
  const summary = useMemo(() => earningsSummary(vaults, events), [vaults, events]);
  const rows = useMemo(() => buildEarningsRows(vaults, events), [vaults, events]);

  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  /* 236ms: one keystroke's worth of settling, not a second of lag */
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSettled(query), FILTER_DEBOUNCE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  const visible = useMemo(() => filterRows(rows, settled, segment), [rows, settled, segment]);
  const total = useMemo(() => totalPaidCents(visible), [visible]);
  const emptyHint =
    rows.length === 0 ? "No earnings yet. Paid vaults appear here." : "No results for this filter.";

  const exportCsv = () => {
    const header = ["Time", "Event", "Vault", "Phase", "Payout status", "Amount", "PayPal ID"];
    const body = visible.map((r: EarningsRow) => [
      fullTime(r.at),
      EVENT_LABEL[r.type],
      r.vaultProject,
      r.phase ? PHASE_LABEL[r.phase] : "",
      r.payoutStatus ? r.payoutStatus.toUpperCase() : "",
      typeof r.amountCents === "number" ? (r.amountCents / 100).toFixed(2) : "",
      r.paypalId ?? "",
    ]);
    /* the guard lives in lib/earnings: a cell starting with = + - @ stays text */
    const csv = toCsv([header, ...body]);

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vaultlance-earnings.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({ message: "Export ready.", tone: "success" });
  };

  return (
    <section className="fd-earnings" aria-labelledby="fd-earn-caption">
      <p id="fd-earn-caption" className="fd-caption">
        WHAT YOU’VE EARNED AND WHEN IT ARRIVES
      </p>

      <div className="fd-sums">
        <div className="fd-sum">
          <span className="fd-kpi-label">THIS MONTH</span>
          <span className="fd-sum-num">
            <CountUp value={summary.thisMonthCents / 100} format={money} />
          </span>
          <span className="fd-sum-sub" />
          <span className="fd-sum-sub" />
        </div>

        <div className="fd-sum">
          <span className="fd-kpi-label">ALL TIME</span>
          <span className="fd-sum-num">
            <CountUp value={summary.allTimeCents / 100} format={money} />
          </span>
          <span className="fd-sum-sub" />
          <span className="fd-sum-sub" />
        </div>

        <div className="fd-sum">
          <span className="fd-kpi-label">PENDING PAYOUT</span>
          <span className="fd-sum-num">
            <CountUp value={summary.pendingCents / 100} format={money} />
          </span>
          <span className="fd-sum-sub">
            <span className="fd-sum-sub-key">IN ESCROW</span> {formatCents(summary.escrowCents)}
          </span>
          {summary.failed.length > 0 ? (
            <button
              type="button"
              className="fd-sum-sub fd-sum-failed"
              onClick={() => {
                const target = vaults.find((v) => v.id === summary.failed[0].vaultId);
                if (target) onOpenVault(target);
              }}
            >
              {summary.failed.length} FAILED {formatCents(summary.failedCents)}
            </button>
          ) : (
            <span className="fd-sum-sub" />
          )}
        </div>
      </div>

      <div className="fd-earn-toolbar">
        <input
          className="fd-input fd-earn-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by vault, event or PayPal ID"
          aria-label="Filter earnings by vault, event or PayPal ID"
        />
        <div className="fd-earn-seg" role="group" aria-label="Filter by kind">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className="fd-earn-seg-item"
              data-on={segment === s.key ? "true" : undefined}
              aria-pressed={segment === s.key}
              onClick={() => setSegment(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" className="fd-btn fd-earn-export" onClick={exportCsv}>
          <Download width="14" height="14" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      <div className="fd-ledger fd-ledger-wide fd-earn-card">
        <EarningsGrid
          rows={visible}
          loading={loading}
          error={error}
          onRetry={onRetry}
          onOpenVault={(id) => {
            const vault = vaults.find((v) => v.id === id);
            if (vault) onOpenVault(vault);
          }}
          emptyHint={emptyHint}
        />

        {/* the phone layout: 89px rows, PayPal behind a tap */}
        <ul className="fd-earn-list" aria-label="Earnings rows">
          {loading &&
            [0, 1, 2, 3].map((i) => (
              <li key={i} className="fd-earn-list-item" aria-hidden="true">
                <span className="fd-skel fd-skel-row" style={{ animationDelay: `${i * 61.8}ms` }} />
              </li>
            ))}
          {!loading &&
            !error &&
            visible.map((r) => {
              const open = expanded === r.id;
              return (
                <li key={r.id} className="fd-earn-list-item" data-open={open ? "true" : undefined}>
                  <button
                    type="button"
                    className="fd-earn-row"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : r.id)}
                  >
                    <span className="fd-earn-row-top">
                      <span className="fd-event">
                        <span className="fd-dot" style={{ background: EVENT_DOT[r.type] ?? "var(--hero-steel)" }} aria-hidden="true" />
                        {EVENT_LABEL[r.type]}
                      </span>
                      <span className="fd-earn-row-amt">
                        {typeof r.amountCents === "number" ? formatCents(r.amountCents) : "—"}
                      </span>
                    </span>
                    <span className="fd-earn-row-bottom">
                      <span className="fd-earn-row-vault">{r.vaultProject}</span>
                      <span className="fd-earn-row-time">{formatRelative(r.at)}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="fd-earn-row-more">
                      <span className="fd-mono">{r.paypalId ?? "No PayPal ID"}</span>
                      {r.paypalId && (
                        <button
                          type="button"
                          className="fd-btn fd-btn-ghost"
                          onClick={() => {
                            void navigator.clipboard?.writeText(r.paypalId!).then(() =>
                              toast({ message: "PayPal ID copied.", tone: "success" })
                            );
                          }}
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
        </ul>

        {!loading && !error && visible.length === 0 && (
          <div className="fd-empty fd-earn-empty">
            <span className="fd-empty-mark" aria-hidden="true">
              <VaultGlyph width="144" height="144" />
            </span>
            <p className="fd-empty-text">{emptyHint}</p>
          </div>
        )}

        {/* Pinned footer. AG's own pinned row is sticky *inside* the scroll area,
            so it eats the last row until you scroll; this one holds the bottom of
            the card at every width and never covers a row. */}
        {!loading && !error && (
          <div className="fd-earn-total">
            <span className="fd-total-label">TOTAL PAID</span>
            <span className="fd-total-amount">{formatCents(total)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
