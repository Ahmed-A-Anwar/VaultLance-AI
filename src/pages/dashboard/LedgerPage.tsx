/* LedgerPage.tsx — "/dashboard/ledger": the same grid, full width, with the
   status and duration columns and a quick filter. */

import { LedgerCard } from "../../components/dashboard/LedgerCard";

export default function LedgerPage() {
  return (
    <div className="dash-bands is-single">
      <LedgerCard full heading="h1" />
    </div>
  );
}
