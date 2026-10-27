/* Overview.tsx — "/dashboard": the greeting and the three totals over the
   decision queue and the ledger, in the golden 0.382 / 0.618 split. */

import { Greeting } from "../../components/dashboard/Greeting";
import { Kpis } from "../../components/dashboard/Kpis";
import { LedgerCard } from "../../components/dashboard/LedgerCard";
import { VaultList } from "../../components/dashboard/VaultList";
import { useDashData } from "../../components/dashboard/data";
import { displayName, useSession } from "../../components/dashboard/session";

export default function Overview() {
  const { kpis } = useDashData();
  const { session } = useSession();
  const firstName = session ? displayName(session.email).split(" ")[0] : "there";

  return (
    <div className="dash-bands">
      <div className="dash-upper">
        <Greeting firstName={firstName} audited={kpis?.awaitingReview ?? 0} />
        <Kpis />
      </div>
      <div className="dash-lower">
        <VaultList />
        <LedgerCard />
      </div>
    </div>
  );
}
