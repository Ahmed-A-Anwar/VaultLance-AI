/* PaymentsPage.tsx — the client's entry for /dashboard/payments.

   The freelancer's payments view is a view of FreelancerDashboard instead, and
   for one reason: the details drawer that "View vault" opens belongs to that
   surface, and a second drawer would be a second set of behaviours to keep in
   step. Both roles land on the same caption, the same cards and the same
   selectors; only the surface that hosts them differs.

   FX.paymentsPage = false puts the old placeholder back on this route. */

import { ClientPayments } from "../../../components/payments/ClientPayments";
import "../../../styles/payments.css";

export default function PaymentsPage() {
  return <ClientPayments />;
}
