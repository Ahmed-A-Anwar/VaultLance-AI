/* TopStrip.tsx — 55px of transparent chrome over the page gradient: the route's
   name, the vault search, the bell and the one brass action.

   The action is a prop now: the client keeps "Join a vault" with no icon, the
   freelancer gets "New vault" with a plus. With no prop the markup is exactly
   what the client dashboard shipped with. */

import { Bell, Search } from "./icons";
import { useDashUi } from "./ui";

const Plus = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    aria-hidden="true"
    className="fd-cta-plus"
    width="14"
    height="14"
  >
    <path d="M8 3.2v9.6M3.2 8h9.6" />
  </svg>
);

export function TopStrip({
  title,
  onJoin,
  showSearch = true,
  primary,
}: {
  title: string;
  onJoin: () => void;
  /* only the areas that list vaults have anything to search: Ledger, Payments
     and Settings drop the field and the strip tightens to two columns */
  showSearch?: boolean;
  /** the role's one brass action; defaults to the client's "Join a vault" */
  primary?: { label: string; withPlus?: boolean; onClick?: () => void };
}) {
  const { query, setQuery, unread, markRead } = useDashUi();

  return (
    <header className="dash-strip" data-enter="strip" data-search={showSearch ? "on" : "off"}>
      <p className="dash-title">{title}</p>

      {showSearch && (
        <div className="dash-search">
          <Search className="dash-search-icon" width="16" height="16" />
          <input
            className="dash-search-input"
            type="search"
            placeholder="Search vaults"
            aria-label="Search vaults"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      <div className="dash-strip-actions">
        <button
          type="button"
          className="dash-bell"
          aria-label={unread ? "Notifications, new activity" : "Notifications"}
          onClick={markRead}
        >
          <Bell width="18" height="18" />
          {unread && <span className="dash-bell-dot" aria-hidden="true" />}
        </button>

        {primary ? (
          <button type="button" className="dash-cta" onClick={primary.onClick}>
            {primary.withPlus && <Plus />}
            {primary.label}
          </button>
        ) : (
          <button type="button" className="dash-cta" onClick={onJoin}>
            Join a vault
          </button>
        )}
      </div>
    </header>
  );
}
