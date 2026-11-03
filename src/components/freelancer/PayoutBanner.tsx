/* PayoutBanner.tsx — 55px of brass-ruled glass that stands until PayPal has an
   address to pay. It is not dismissible while the address is missing: there is
   no version of this app where a payout lands without one.

   The address lives in the same mock settings the rest of the dashboard reads
   (localStorage "vl.fd.paypalEmail"), seeded for Maya; the Shift+D panel clears
   it so the banner can be seen. */

import { Link } from "react-router-dom";

const KEY = "vl.fd.paypalEmail";

export function paypalEmail(): string {
  if (typeof window === "undefined") return "maya@example.com";
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved === null ? "maya@example.com" : saved;
  } catch {
    return "maya@example.com";
  }
}

export function setPaypalEmail(value: string): void {
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
    /* the default is Maya's address, so "missing" has to be stored as empty */
    if (!value) window.localStorage.setItem(KEY, "");
  } catch {
    /* storage blocked */
  }
}

export function PayoutBanner() {
  if (paypalEmail()) return null;

  return (
    <div className="fd-banner" role="status">
      <span className="fd-banner-mark" aria-hidden="true" />
      <p className="fd-banner-text">Add your PayPal email to receive payouts.</p>
      <Link className="fd-btn fd-btn-ghost" to="/dashboard/settings#profile">
        Add email
      </Link>
    </div>
  );
}
