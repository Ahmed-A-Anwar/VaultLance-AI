/* FreelancerDashboard.tsx — the freelancer surface. Slices land here: the
   role shell is wired first, then the data, the bands, the drawers and the
   ledger mount inside this component.

   Mock data only. Nothing here reads the client dashboard's live rows. */

import { FreelancerView } from "../Freelancer";

export function FreelancerDashboard({ email }: { email: string }) {
  /* until the first view lands, the coming-soon panel stands in behind the
     flag, exactly as it does when FX.freelancerDashboard is false */
  return <FreelancerView email={email} />;
}
