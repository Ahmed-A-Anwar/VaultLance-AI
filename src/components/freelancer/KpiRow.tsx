/* KpiRow.tsx — the upper band's right column. Three 89px cards on one row,
   equal widths, labels that never wrap, numbers on a shared baseline, and the
   shared CountUp for the walk between values.

   A failed read shows an em dash rather than a zero: three zeros would read as
   "all settled", which is the opposite of what a failure means. */

import { useEffect, useRef, useState } from "react";
import { CountUp } from "../dashboard/CountUp";
import { Padlock, PadlockOpen, Wheel } from "../dashboard/icons";
import { formatCents } from "../../lib/fees";
import type { FreelancerKpis } from "./mockApi";

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
/* the client's KPI money format: whole dollars, no cents, so the three cards
   read as totals rather than as ledger lines */
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function KpiRow({ kpis, failed }: { kpis: FreelancerKpis | null; failed: boolean }) {
  const [summary, setSummary] = useState("");
  const announced = useRef(false);

  useEffect(() => {
    if (!kpis) return;
    if (!announced.current) {
      announced.current = true;
      return;
    }
    setSummary(
      `In escrow ${formatCents(kpis.inEscrowCents)}. ${kpis.inReviewCount} in review. Paid out ${formatCents(
        kpis.paidOutCents
      )}.`
    );
  }, [kpis]);

  const shown = (node: React.ReactNode) => (failed ? "—" : node);

  return (
    <>
      <div className="fd-kpis">
        <div className="fd-kpi" data-accent="brass" title="Estimated amount you receive after fees.">
          <span className="fd-kpi-top">
            <span className="fd-kpi-ico" aria-hidden="true">
              <Padlock width="13" height="13" />
            </span>
            <span className="fd-kpi-label">IN ESCROW</span>
          </span>
          <span className="fd-kpi-num">
            {kpis ? shown(<CountUp value={kpis.inEscrowCents / 100} format={(n) => usd.format(Math.round(n))} />) : <span className="fd-skel fd-skel-num" />}
          </span>
        </div>

        <div className="fd-kpi" data-accent="teal">
          <span className="fd-kpi-top">
            <span className="fd-kpi-ico" aria-hidden="true">
              <Wheel width="13" height="13" />
            </span>
            <span className="fd-kpi-label">IN REVIEW</span>
          </span>
          <span className="fd-kpi-num">
            {kpis ? shown(<CountUp value={kpis.inReviewCount} format={(n) => int.format(Math.round(n))} />) : <span className="fd-skel fd-skel-num" />}
          </span>
        </div>

        <div className="fd-kpi" data-accent="success">
          <span className="fd-kpi-top">
            <span className="fd-kpi-ico" aria-hidden="true">
              <PadlockOpen width="13" height="13" />
            </span>
            <span className="fd-kpi-label">PAID OUT</span>
          </span>
          <span className="fd-kpi-num">
            {kpis ? shown(<CountUp value={kpis.paidOutCents / 100} format={(n) => usd.format(Math.round(n))} />) : <span className="fd-skel fd-skel-num" />}
          </span>
        </div>
      </div>

      <p className="fd-sr" aria-live="polite">
        {summary}
      </p>
    </>
  );
}
