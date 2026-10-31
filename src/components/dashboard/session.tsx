/* session.tsx — the dashboard's session context. mockAuth owns the rule and the
   sessionStorage mirror; this holds the same value for React so the guard, the
   rail badge and the freelancer view read one thing. A missing or unreadable
   storage simply renders signed out. */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { clearSession, readSession, writeSession, type Role, type Session } from "../../lib/mockAuth";

interface SessionValue {
  session: Session | null;
  role: Role | null;
  signOut: () => void;
  /* Settings writes the chosen name back here, so the rail's chip and the
     greeting change without a reload. It is additive: nothing else calls it. */
  updateUser: (patch: { fullName?: string }) => void;
}

const EMPTY: SessionValue = { session: null, role: null, signOut: () => {}, updateUser: () => {} };

const SessionContext = createContext<SessionValue>(EMPTY);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const updateUser = useCallback((patch: { fullName?: string }) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: Session = { ...prev };
      const name = patch.fullName?.trim();
      if (name) next.name = name;
      writeSession(next);
      return next;
    });
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ session, role: session?.role ?? null, signOut, updateUser }),
    [session, signOut, updateUser]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/* The user chip's name: the name saved in Settings when there is one, otherwise
   the local part of the address, capitalised. Reading the mirrored session here
   means the rail and the greeting follow updateUser without either of them
   knowing that settings exists. */
export function displayName(email: string): string {
  const saved = readSession();
  if (saved?.name && saved.email === email) return saved.name;
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Guest";
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(email: string): string {
  const parts = displayName(email).split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "GU";
}
