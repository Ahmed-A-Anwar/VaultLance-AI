/* session.tsx — the dashboard's session context. mockAuth owns the rule and the
   sessionStorage mirror; this holds the same value for React so the guard, the
   rail badge and the freelancer view read one thing. A missing or unreadable
   storage simply renders signed out. */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { clearSession, readSession, type Role, type Session } from "../../lib/mockAuth";

interface SessionValue {
  session: Session | null;
  role: Role | null;
  signOut: () => void;
}

const EMPTY: SessionValue = { session: null, role: null, signOut: () => {} };

const SessionContext = createContext<SessionValue>(EMPTY);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ session, role: session?.role ?? null, signOut }),
    [session, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/* the user chip's name: the local part of the address, capitalised */
export function displayName(email: string): string {
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Guest";
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(email: string): string {
  const parts = displayName(email).split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "GU";
}
