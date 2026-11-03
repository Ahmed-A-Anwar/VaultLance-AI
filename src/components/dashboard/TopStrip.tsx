/* TopStrip.tsx — 55px of transparent chrome over the page gradient: the route's
   name, the vault search, the bell and the one brass action. */

import { Bell, Search } from "./icons";
import { useDashUi } from "./ui";

export function TopStrip({
  title,
  onJoin,
  showSearch = true,
}: {
  title: string;
  onJoin: () => void;
  /* only the areas that list vaults have anything to search: Ledger, Payments
     and Settings drop the field and the strip tightens to two columns */
  showSearch?: boolean;
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

        <button type="button" className="dash-cta" onClick={onJoin}>
          Join a vault
        </button>
      </div>
    </header>
  );
}
