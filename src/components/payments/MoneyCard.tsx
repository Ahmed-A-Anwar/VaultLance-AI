/* MoneyCard.tsx — one 89px summary card. It is the dashboard's KPI card wearing
   a payments label: same markup, same CountUp, same accent bar, so the three
   cards here and the three on the Overview read as one family.

   The zero cases are the interesting ones: a failed total of zero says NONE
   rather than $0.00, because zero failures is good news, not an empty ledger. */

import type { ReactNode } from "react";
import { CountUp } from "../dashboard/CountUp";
import { formatCents } from "../../lib/fees";

const money = (n: number) => formatCents(Math.round(n * 100));

export interface MoneyCardProps {
  label: string;
  /** cents; null while the read is in flight */
  cents: number | null;
  accent: "success" | "brass" | "danger" | "steel";
  icon: ReactNode;
  /** shown in place of the number when it is zero and that is worth saying */
  zeroText?: string;
  /** spins the accent glyph while there is something pending */
  busy?: boolean;
  title?: string;
}

export function MoneyCard({ label, cents, accent, icon, zeroText, busy, title }: MoneyCardProps) {
  const zero = cents === 0;
  return (
    <div className="fd-kpi pay-kpi" data-accent={accent} title={title}>
      <span className="fd-kpi-top">
        <span className={`fd-kpi-ico${busy ? " pay-spin" : ""}`} aria-hidden="true">
          {icon}
        </span>
        <span className="fd-kpi-label">{label}</span>
      </span>
      <span className="fd-kpi-num pay-kpi-num">
        {cents === null ? (
          <span className="fd-skel fd-skel-num" aria-hidden="true" />
        ) : zero && zeroText ? (
          <span className="pay-none">{zeroText}</span>
        ) : (
          <CountUp value={cents / 100} format={money} />
        )}
      </span>
    </div>
  );
}
