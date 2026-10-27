/* data.tsx — one read of the mock API for the whole dashboard. The shell owns
   it, so moving between /dashboard and /dashboard/vaults does not refetch, and
   the ledger's live events reach the vault list, the KPIs and the toasts at the
   same time. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  getKpis,
  listEvents,
  listVaults,
  subscribe,
  type Kpis,
  type LedgerEvent,
  type Vault,
} from "../../lib/api";

interface DashDataValue {
  vaults: Vault[];
  events: LedgerEvent[];
  kpis: Kpis | null;
  loading: boolean;
  error: ApiError | null;
  /* re-read everything; the error and empty states call this */
  reload: () => void;
  /* a write returned a vault: fold it in without waiting for a refetch */
  putVault: (vault: Vault) => void;
  latestEvent: LedgerEvent | null;
  clearLatest: () => void;
}

const DashDataContext = createContext<DashDataValue | null>(null);

const asApiError = (e: unknown): ApiError =>
  e instanceof ApiError ? e : new ApiError("network", "Something went wrong. Try again.");

export function DashDataProvider({ children }: { children: ReactNode }) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [latestEvent, setLatestEvent] = useState<LedgerEvent | null>(null);
  const [pass, setPass] = useState(0);

  /* skeleton only on the first read or an explicit retry, never on a quiet
     refresh behind a live event */
  const haveData = useRef(false);

  useEffect(() => {
    let live = true;
    if (!haveData.current) setLoading(true);
    setError(null);

    Promise.all([listVaults(), listEvents(), getKpis()])
      .then(([nextVaults, nextEvents, nextKpis]) => {
        if (!live) return;
        setVaults(nextVaults);
        setEvents(nextEvents);
        setKpis(nextKpis);
        haveData.current = true;
      })
      .catch((e) => {
        if (!live) return;
        setError(asApiError(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [pass]);

  /* the dev panel and every write fan out through here */
  useEffect(
    () =>
      subscribe((event) => {
        setLatestEvent(event);
        setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [event, ...prev]));
        setPass((n) => n + 1);
      }),
    []
  );

  const reload = useCallback(() => {
    haveData.current = false;
    setPass((n) => n + 1);
  }, []);

  const putVault = useCallback((vault: Vault) => {
    setVaults((prev) => prev.map((v) => (v.id === vault.id ? vault : v)));
  }, []);

  const clearLatest = useCallback(() => setLatestEvent(null), []);

  const value = useMemo<DashDataValue>(
    () => ({ vaults, events, kpis, loading, error, reload, putVault, latestEvent, clearLatest }),
    [vaults, events, kpis, loading, error, reload, putVault, latestEvent, clearLatest]
  );

  return <DashDataContext.Provider value={value}>{children}</DashDataContext.Provider>;
}

export function useDashData(): DashDataValue {
  const value = useContext(DashDataContext);
  if (!value) throw new Error("useDashData outside DashDataProvider");
  return value;
}
