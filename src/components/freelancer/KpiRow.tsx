/* KpiRow.tsx — IN ESCROW / IN REVIEW / PAID OUT. 89px cards, one row, labels on
   one line and numbers on one baseline. Count-up on mount and on change; one
   polite summary line so a screen reader hears the new figures once.

   IN ESCROW is the estimate the freelancer receives after fees, not the gross
   the client funded — the tooltip says so in words. */

import { useEffect, useRef, useState } from "react";
import { CountUp } from "../dashboard/CountUp";
import { Padlock, PadlockOpen, Wheel } from "../dashboard/icons";
import type { FreelancerKpis } from "./mockApi";
import { formatCents } from "../../lib/fees";

export function KpiRow({
  kpis,
  loading,
  error,
}: {
  kpis: FreelancerKpis | null;
  loading: boolean;
  error: string | null;
}) {
  const [summary, setSummary] = useState("");
  const announced = useRef(false);

  useEffect(() => {
    if (!kpis) return;
    if (!announced.current) {
      announced.current = true;
      return;
    }
    setSummary(
      `In escrow ${formatCents(kpis.inEscrowCents)}. ${kpis.inReview} in review. Paid out ${formatCents(kpis.paidOutCents)}.`
    );
  }, [kpis]);

  if (loading && !kpis) {
    return (
      <div className="fd-kpis" aria-busy="true" aria-label="Loading your totals">
        {[0, 1, 2].map((i) => (
          <div key={i} className="fd-kpi is-skeleton">
            <span className="fd-skel fd-skel-label" />
            <span className="fd-skel fd-skel-num" />
          </div>
        ))}
      </div>
    );
  }

  /* a failed read is not a zero */
  const failed = !kpis && !!error;

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
            {failed ? "—" : <CountUp value={(kpis?.inEscrowCents ?? 0) / 100} format={(n) => formatCents(n * 100)} />}
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
            {failed ? "—" : <CountUp value={kpis?.inReview ?? 0} format={(n) => String(Math.round(n))} />}
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
            {failed ? "—" : <CountUp value={(kpis?.paidOutCents ?? 0) / 100} format={(n) => formatCents(n * 100)} />}
          </span>
        </div>
      </div>

      <p className="dash-sr" aria-live="polite">
        {summary}
      </p>
    </>
  );
}
