/* VaultsPage.tsx — "/dashboard/vaults": the same list, one column, full width. */

import { VaultList } from "../../components/dashboard/VaultList";

export default function VaultsPage() {
  return (
    <div className="dash-bands is-single">
      <VaultList heading="h1" />
    </div>
  );
}
