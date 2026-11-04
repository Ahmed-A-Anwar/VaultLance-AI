/* TopStrip.tsx — 55px of transparent chrome over the page gradient: the route's
   name, the vault search, the bell and the one brass action.

   The client's action is "Join a vault" and is the default. A role that needs a
   different action passes `primary`; the default branch renders the same button
   it always did, so the client's strip is byte-identical. */

import { Bell, Plus, Search } from "./icons";
import { useDashUi } from "./ui";

interface PrimaryAction {
  label: string;
  withPlus?: boolean;
  onClick: () => void;
}

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
  primary?: PrimaryAction;
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
          <button type="button" className="dash-cta dash-cta-primary" onClick={primary.onClick}>
            {primary.withPlus && <Plus width="14" height="14" aria-hidden="true" />}
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
