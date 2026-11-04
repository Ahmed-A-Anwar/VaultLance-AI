/* PayoutMethodCard.tsx — where the freelancer's money lands. The address is the
   same mock address the backend will hold; the card only reads it.

   The missing-address state is the same condition as the Overview's payout
   banner (the mock's hasPaypalEmail flag), styled here as a brass edge rather
   than a second banner. */

import { Link } from "react-router-dom";
import { Check } from "../dashboard/icons";
import { WalletIcon } from "./icons";
import type { PayoutProfile } from "./paymentsModel";

export function PayoutMethodCard({ profile, loading }: { profile: PayoutProfile | null; loading: boolean }) {
  const missing = !loading && profile !== null && !profile.paypalEmail;

  return (
    <section className="pay-card" aria-labelledby="pay-method-h">
      <div className="pay-card-head">
        <h2 id="pay-method-h" className="pay-card-h">
          Payout method
        </h2>
        {loading && <span className="fd-skel pay-skel-chip" aria-hidden="true" />}
        {!loading && profile?.verified && (
          <span className="pay-chip pay-chip-ok">
            <Check width="10" height="10" aria-hidden="true" />
            VERIFIED
          </span>
        )}
      </div>

      {loading ? (
        <span className="fd-skel pay-skel-line" aria-hidden="true" />
      ) : missing ? (
        <div className="pay-missing">
          <p className="pay-missing-text">Add your PayPal email to get paid.</p>
          <Link className="fd-btn fd-btn-primary pay-btn-sm" to="/dashboard/settings#profile">
            Add email
          </Link>
        </div>
      ) : (
        <div className="pay-method">
          <span className="pay-method-ico" aria-hidden="true">
            <WalletIcon width="21" height="21" />
          </span>
          <div className="pay-method-body">
            <span className="fd-mono pay-method-mail">{profile?.paypalEmail}</span>
            <Link className="fd-btn fd-btn-ghost pay-btn-sm" to="/dashboard/settings#profile">
              Change email
            </Link>
          </div>
        </div>
      )}

      <p className="pay-note">
        Payouts go to this PayPal account. Sandbox only: no real money moves.
      </p>
    </section>
  );
}
