/* SettingsNav.tsx — the 233px section rail. Buttons, not links: the page is one
   route, and a section change is a scroll, not a navigation (which is also why a
   section change never trips the unsaved guard).

   Active gets the rail's own language — a 3px brass bar and a bolt dot; hover
   draws a teal underline left to right; a section with a pending change carries
   an amber dot beside its label. */

import type { SectionDef, SectionKey } from "./sections";

export interface SettingsNavProps {
  items: SectionDef[];
  active: SectionKey;
  dirty: Record<string, boolean>;
  onGo: (key: SectionKey) => void;
}

export function SettingsNav({ items, active, dirty, onGo }: SettingsNavProps) {
  return (
    <nav className="set-nav" aria-label="Settings sections" data-enter="nav">
      <ul className="set-nav-list">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <button
                type="button"
                className="set-nav-item"
                data-active={isActive ? "1" : "0"}
                data-tone={item.danger ? "danger" : "default"}
                aria-current={isActive ? "true" : undefined}
                data-testid={`settings-nav-${item.key}`}
                onClick={() => onGo(item.key)}
              >
                <span className="set-nav-bar" aria-hidden="true" />
                <span className="set-nav-label">{item.label}</span>
                {dirty[item.key] && (
                  <>
                    <span className="set-nav-dirty" aria-hidden="true" />
                    <span className="dash-sr">unsaved changes</span>
                  </>
                )}
                <span className="set-nav-bolt" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
