/* FreelancerData.tsx — one read, one subscription, one place that knows the
   loading and error states. Reads are allowed to fail (the mock fails 5% of
   them on purpose), so the error carries a retry rather than a fallback value. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { hasPayoutEmail } from "../../lib/api";
import { isDemoMode } from "../../lib/apiClient";
import {
  getFreelancerKpis as demoKpis,
  listFreelancerEvents as demoEvents,
  listFreelancerVaults as demoVaults,
  subscribe,
  type FreelancerEvent,
  type FreelancerKpis,
  type FreelancerVault,
} from "./mockApi";
import {
  kpisFor,
  listFreelancerEvents as liveEvents,
  listFreelancerVaults as liveVaults,
} from "./liveApi";

interface Value {
  vaults: FreelancerVault[];
  events: FreelancerEvent[];
  kpis: FreelancerKpis | null;
  loading: boolean;
  error: string | null;
  paypalMissing: boolean;
  refresh: () => Promise<void>;
  applyVault: (v: FreelancerVault) => void;
  dropVault: (id: string) => void;
  noteEvent: (e: FreelancerEvent) => void;
}

const Ctx = createContext<Value | null>(null);

export function FreelancerDataProvider({ children }: { children: ReactNode }) {
  const [vaults, setVaults] = useState<FreelancerVault[]>([]);
  const [events, setEvents] = useState<FreelancerEvent[]>([]);
  const [kpis, setKpis] = useState<FreelancerKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paypalMissing, setPaypalMissing] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemoMode()) {
        const [v, e, k] = await Promise.all([demoVaults(), demoEvents(), demoKpis()]);
        if (!alive.current) return;
        setVaults(v);
        setEvents(e);
        setKpis(k);
      } else {
        /* the server is the source: vaults first, then the ledger rows for
           those vaults, then the same earnings selectors for the strip */
        const v = await liveVaults();
        const e = await liveEvents(v);
        if (!alive.current) return;
        setVaults(v);
        setEvents(e);
        setKpis(kpisFor(v));
      }
      if (!alive.current) return;
      setError(null);
      setPaypalMissing(!hasPayoutEmail());
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : "The vault service didn’t answer.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    /* the demo store fans out locally; the server has no stream yet, so a real
       session refreshes on the actions that change it */
    if (!isDemoMode()) return;
    return subscribe((event) => {
      setEvents((prev) => [event, ...prev]);
      void demoKpis()
        .then(setKpis)
        .catch(() => {});
    });
  }, []);

  const applyVault = useCallback((v: FreelancerVault) => {
    setVaults((prev) => prev.map((row) => (row.id === v.id ? v : row)));
  }, []);

  const dropVault = useCallback((id: string) => {
    setVaults((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const noteEvent = useCallback((e: FreelancerEvent) => {
    setEvents((prev) => (prev.some((row) => row.id === e.id) ? prev : [e, ...prev]));
  }, []);

  const value = useMemo<Value>(
    () => ({
      vaults,
      events,
      kpis,
      loading,
      error,
      paypalMissing,
      refresh,
      applyVault,
      dropVault,
      noteEvent,
    }),
    [vaults, events, kpis, loading, error, paypalMissing, refresh, applyVault, dropVault, noteEvent]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFreelancerData(): Value {
  const value = useContext(Ctx);
  if (!value) throw new Error("useFreelancerData must be used inside FreelancerDataProvider");
  return value;
}
