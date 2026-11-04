/* FreelancerPayments.tsx — the freelancer's Payments page: what has arrived,
   what is waiting, and what failed, over the history that produced all three.

   Every figure comes from paymentsApi, which reads the same vaults the rest of
   the freelancer surface reads and does its arithmetic in lib/fees and
   lib/earnings. The page owns one read, one retry, and one refresh after a
   payout is resent; the details drawer belongs to the dashboard around it. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PadlockOpen, Clock } from "../dashboard/icons";
import { Refresh } from "./icons";
import { MoneyCard } from "./MoneyCard";
import { PayoutMethodCard } from "./PayoutMethodCard";
import { PayoutHistory } from "./PayoutHistory";
import { StepsCard } from "./StepsCard";
import { FeeCalculator } from "./FeeCalculator";
import {
  downloadReceipt,
  getPayoutProfile,
  listPayouts,
  payoutTotals,
  retryPayout,
  type Payout,
  type PayoutProfile,
} from "./paymentsApi";
import type { Receipt } from "./paymentsModel";

const receiptFor = (p: Payout): Receipt => ({
  id: `rc_${p.id}`,
  vaultId: p.vaultId,
  project: p.project,
  kind: "capture",
  amountCents: p.grossCents,
  paypalId: p.paypalPayoutId ?? "—",
  createdAt: p.paidAt ?? p.createdAt,
});

export function FreelancerPayments({ onOpenVault }: { onOpenVault: (vaultId: string) => void }) {
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [profile, setProfile] = useState<PayoutProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const [rows, me] = await Promise.all([listPayouts(), getPayoutProfile()]);
      if (!alive.current) return;
      setPayouts(rows);
      setProfile(me);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : "The payments service didn’t answer.");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void load().finally(() => alive.current && setLoading(false));
    return () => {
      alive.current = false;
    };
  }, [load]);

  /* one sweep, then the row is just a paid row again */
  useEffect(() => {
    if (!justPaid) return;
    const timer = window.setTimeout(() => setJustPaid(null), 1618);
    return () => window.clearTimeout(timer);
  }, [justPaid]);

  const totals = useMemo(() => payoutTotals(payouts ?? []), [payouts]);

  const reload = () => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  };

  const retry = async (vaultId: string) => {
    const next = await retryPayout(vaultId);
    setPayouts((prev) => (prev ? prev.map((p) => (p.vaultId === vaultId ? next : p)) : prev));
    setJustPaid(vaultId);
  };

  const cents = payouts === null && loading ? null : totals;

  return (
    <div className="pay-page" data-role="freelancer">
      <div className="pay-head">
        <p className="pay-caption">HOW YOU GET PAID</p>
      </div>

      <div className="fd-kpis pay-kpis">
        <MoneyCard
          label="TOTAL PAID"
          cents={cents ? cents.paidCents : null}
          accent="success"
          icon={<PadlockOpen width="13" height="13" />}
          title="Net payouts that have arrived, after both fees."
        />
        <MoneyCard
          label="PENDING"
          cents={cents ? cents.pendingCents : null}
          accent="brass"
          icon={<Clock width="13" height="13" />}
          busy={(cents?.pendingCents ?? 0) > 0}
          title="Captured and waiting for the payout run."
        />
        <MoneyCard
          label="FAILED"
          cents={cents ? cents.failedCents : null}
          accent="danger"
          icon={<Refresh width="13" height="13" />}
          zeroText="NONE"
          title="Payouts PayPal refused. Nothing is lost: retry from the row."
        />
      </div>

      <div className="pay-cols">
        <PayoutHistory
          payouts={payouts ?? []}
          loading={loading}
          error={error}
          onReload={reload}
          onOpenVault={onOpenVault}
          onRetryPayout={retry}
          onDownloadReceipt={(p) => downloadReceipt(receiptFor(p))}
          justPaid={justPaid}
        />

        <div className="pay-side">
          <PayoutMethodCard profile={profile} loading={loading && !profile} />
          <StepsCard
            title="How payouts work"
            steps={[
              "Client approves the work",
              "PayPal captures the held funds",
              "VaultLance fee and PayPal fee are deducted",
              "You receive the net amount",
            ]}
            note="You receive the amount minus the 5% VaultLance fee and PayPal’s processing fee."
          />
          <FeeCalculator />
        </div>
      </div>
    </div>
  );
}
