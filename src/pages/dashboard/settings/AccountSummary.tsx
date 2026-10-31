/* AccountSummary.tsx — the right column: who is signed in, since when, and the
   vault image the whole product is built around. No wheel overlay and no clip:
   the frame is a still, floating y ±8px on a 6.18s sine.

   The name and the address come from the page's saved profile, so a successful
   save changes this card and the rail's chip in the same commit. */

import { SignOut } from "../../../components/dashboard/icons";
import { initialsOf } from "../../../components/settings/initials";
import type { AccountProfile } from "../../../lib/api";

export function AccountSummary({
  profile,
  vaultCount,
  onSignOut,
}: {
  profile: AccountProfile;
  vaultCount: number | null;
  onSignOut: () => void;
}) {
  return (
    <aside className="set-summary" aria-label="Account summary" data-enter="summary" data-testid="account-summary">
      <div className="set-summary-figure" aria-hidden="true">
        <img className="set-summary-img" src="/vault-frames/f_001.webp" alt="" />
      </div>

      <div className="set-summary-id">
        <span className="set-avatar" aria-hidden="true">
          {initialsOf(profile.fullName)}
        </span>
        <div className="set-summary-text">
          <p className="set-summary-name" data-testid="summary-name">
            {profile.fullName}
          </p>
          <p className="set-summary-email" title={profile.email}>
            {profile.email}
          </p>
        </div>
      </div>

      {/* the shared chip's shape and type, in the teal that means "signed in" */}
      <span className="dash-chip set-chip-client" data-testid="summary-role">
        {profile.role.toUpperCase()}
      </span>

      <div className="set-summary-meta">
        <p className="set-meta-line">
          <span className="set-meta-key">MEMBER SINCE</span>
          <span className="set-meta-val">{profile.memberSince}</span>
        </p>
        <p className="set-meta-line">
          <span className="set-meta-key">VAULTS</span>
          <span className="set-meta-val">{vaultCount ?? "—"}</span>
        </p>
        <p className="set-meta-line">
          <span className="set-meta-key">SANDBOX DEMO</span>
        </p>
      </div>

      <button type="button" className="dash-btn dash-btn-ghost set-signout" onClick={onSignOut}>
        <SignOut className="set-signout-icon" width="16" height="16" />
        <span className="dash-btn-label">Sign out</span>
      </button>
    </aside>
  );
}
