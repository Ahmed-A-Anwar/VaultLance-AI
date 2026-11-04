/* PayoutBanner.tsx — the one notice that stays until it is answered. It is not
   dismissible: without an address there is nowhere to send the money, so the
   banner disappears by being satisfied, not by being closed. */

import { Link } from "react-router-dom";

export function PayoutBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <aside className="fd-banner" role="status">
      <span className="fd-banner-mark" aria-hidden="true" />
      <p className="fd-banner-text">Add your PayPal email to receive payouts.</p>
      <Link className="fd-btn fd-btn-ghost" to="/dashboard/settings#profile">
        Add email
      </Link>
    </aside>
  );
}
