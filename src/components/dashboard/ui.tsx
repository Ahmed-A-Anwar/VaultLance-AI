/* ui.tsx — the little bit of state the shell and the pages share: the search
   field in the top strip filters the vault list in the body, the strip's CTA
   opens the join row, and a bell dot remembers unread events. */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface DashUiValue {
  query: string;
  setQuery: (v: string) => void;
  joinOpen: boolean;
  setJoinOpen: (v: boolean) => void;
  unread: boolean;
  markRead: () => void;
  noteEvent: () => void;
  /* bumped after a vault changes so every mounted list refetches */
  revision: number;
  bumpRevision: () => void;
}

const DashUiContext = createContext<DashUiValue>({
  query: "",
  setQuery: () => {},
  joinOpen: false,
  setJoinOpen: () => {},
  unread: false,
  markRead: () => {},
  noteEvent: () => {},
  revision: 0,
  bumpRevision: () => {},
});

export function DashUiProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [revision, setRevision] = useState(0);

  const markRead = useCallback(() => setUnread(false), []);
  const noteEvent = useCallback(() => setUnread(true), []);
  const bumpRevision = useCallback(() => setRevision((n) => n + 1), []);

  const value = useMemo<DashUiValue>(
    () => ({
      query,
      setQuery,
      joinOpen,
      setJoinOpen,
      unread,
      markRead,
      noteEvent,
      revision,
      bumpRevision,
    }),
    [query, joinOpen, unread, markRead, noteEvent, revision, bumpRevision]
  );

  return <DashUiContext.Provider value={value}>{children}</DashUiContext.Provider>;
}

export const useDashUi = () => useContext(DashUiContext);
