/* Kpis.tsx — the upper band's right column: three numbers on one row, each
   card 89px tall, each with the accent that belongs to it. Count-up on mount
   and on every change; one polite summary line for assistive tech, so a screen
   reader hears the new figures once instead of on every tick. */

import { useEffect, useRef, useState } from "react";
import { CountUp } from "./CountUp";
import { Padlock, PadlockOpen, Wheel } from "./icons";
import { useDashData } from "./data";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function Kpis() {
  const { kpis, loading } = useDashData();
  const [summary, setSummary] = useState("");
  const announced = useRef(false);

  /* the first read is not an "update": only later changes are announced */
  useEffect(() => {
    if (!kpis) return;
    if (!announced.current) {
      announced.current = true;
      return;
    }
    setSummary(
      `Funds held ${usd.format(kpis.fundsHeld)}. ${kpis.awaitingReview} awaiting review. ${kpis.unlocked} unlocked.`
    );
  }, [kpis]);

  if (loading && !kpis) {
    return (
      <div className="dash-kpis" aria-busy="true" aria-label="Loading totals">
        {[0, 1, 2].map((i) => (
          <div key={i} className="dash-kpi is-skeleton">
            <span className="dash-skel dash-skel-ico" />
            <span className="dash-skel dash-skel-label" />
            <span className="dash-skel dash-skel-num" />
          </div>
        ))}
      </div>
    );
  }

  const held = kpis?.fundsHeld ?? 0;
  const review = kpis?.awaitingReview ?? 0;
  const unlocked = kpis?.unlocked ?? 0;

  return (
    <>
      <div className="dash-kpis">
        <div className="dash-kpi" data-accent="brass" data-enter="kpi">
          <span className="dash-kpi-ico" aria-hidden="true">
            <Padlock width="16" height="16" />
          </span>
          <span className="dash-kpi-label">FUNDS HELD</span>
          <span className="dash-kpi-num">
            <CountUp value={held} format={(n) => usd.format(Math.round(n))} />
          </span>
        </div>

        <div className="dash-kpi" data-accent="teal" data-enter="kpi">
          <span className="dash-kpi-ico" aria-hidden="true">
            <Wheel width="16" height="16" />
          </span>
          <span className="dash-kpi-label">AWAITING REVIEW</span>
          <span className="dash-kpi-num">
            <CountUp value={review} format={(n) => int.format(Math.round(n))} />
          </span>
        </div>

        <div className="dash-kpi" data-accent="success" data-enter="kpi">
          <span className="dash-kpi-ico" aria-hidden="true">
            <PadlockOpen width="16" height="16" />
          </span>
          <span className="dash-kpi-label">UNLOCKED</span>
          <span className="dash-kpi-num">
            <CountUp value={unlocked} format={(n) => int.format(Math.round(n))} />
          </span>
        </div>
      </div>

      <p className="dash-sr" aria-live="polite">
        {summary}
      </p>
    </>
  );
}
