/* Rail.tsx — the vault's left rail. 89px collapsed, expanding to 233px as an
   overlay on hover or focus within, so the page content never moves. Glass steel
   over the page gradient, a brass hairline down the inner edge, and a bolt at
   each end of it. */

import { Link, NavLink } from "react-router-dom";
import { Bell, CardIcon, Gear, Grid, Rows, SignOut, VaultGlyph } from "./icons";
import { displayName, initials, type useSession } from "./session";

const ITEMS = [
  { to: "/dashboard", label: "Overview", Icon: Grid, end: true },
  { to: "/dashboard/vaults", label: "Vaults", Icon: VaultGlyph, end: false },
  { to: "/dashboard/ledger", label: "Ledger", Icon: Rows, end: false },
  { to: "/dashboard/payments", label: "Payments", Icon: CardIcon, end: false },
  { to: "/dashboard/settings", label: "Settings", Icon: Gear, end: false },
];

export function Rail({
  session,
  signOut,
}: {
  session: NonNullable<ReturnType<typeof useSession>["session"]>;
  signOut: () => void;
}) {
  const name = displayName(session.email);

  return (
    <nav className="dash-rail" aria-label="Dashboard" data-enter="rail">
      <span className="dash-rail-bolt dash-rail-bolt-top" aria-hidden="true" />

      <Link to="/dashboard" className="dash-wordmark">
        <span className="dash-mark" aria-hidden="true">
          <VaultGlyph width="21" height="21" />
        </span>
        <span className="dash-wordmark-text">VaultLance AI</span>
      </Link>

      <ul className="dash-nav">
        {ITEMS.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => `dash-nav-item${isActive ? " is-active" : ""}`}
            >
              <span className="dash-nav-bar" aria-hidden="true" />
              <Icon className="dash-nav-icon" width="18" height="18" />
              <span className="dash-nav-label">{label}</span>
              <span className="dash-nav-bolt" aria-hidden="true" />
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="dash-rail-foot">
        <div className="dash-user">
          <span className="dash-avatar" aria-hidden="true">
            {initials(session.email)}
          </span>
          <span className="dash-user-meta">
            <span className="dash-user-name">{name}</span>
            <span className="dash-badge">{session.role.toUpperCase()}</span>
          </span>
        </div>

        <button type="button" className="dash-nav-item dash-signout" onClick={signOut}>
          <span className="dash-nav-bar" aria-hidden="true" />
          <SignOut className="dash-nav-icon" width="18" height="18" />
          <span className="dash-nav-label">Sign out</span>
        </button>
      </div>

      <span className="dash-rail-bolt dash-rail-bolt-bottom" aria-hidden="true" />
    </nav>
  );
}

/* the bell lives with the rail's icon set but is drawn in the strip */
export { Bell };
