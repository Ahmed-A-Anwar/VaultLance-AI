/* FreelancerSettings.tsx — the settings route's freelancer entry.

   It is the one settings page with role variants, not a second page: the same
   233/610/377 layout, the same nav, cards, dirty footer and entrance, with the
   freelancer's section list (profile, payouts, notifications, security,
   preferences, danger) and its data handed in from the dashboard's chrome.

   Saving the payout email is the coupling point the routing test drives: the
   chrome refreshes once on success, so the Overview's payout banner and the
   Payments page's payout-method card can't drift from what Settings saved. */

import { useFreelancerData } from "../../../components/freelancer/FreelancerData";
import { SettingsPage } from "../settings/SettingsPage";

export function FSettings() {
  const { vaults, events, refresh } = useFreelancerData();
  return <SettingsPage freelancer={{ vaults, events }} onPayoutSaved={() => void refresh()} />;
}
