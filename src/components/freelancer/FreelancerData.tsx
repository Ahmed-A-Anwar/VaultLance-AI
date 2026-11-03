/* FreelancerData.tsx — one provider for the freelancer dashboard: the vault
   list, the event feed, the KPI summary, the loading and error shape, and the
   `perform` helper every card action runs through so failures always reach the
   toast with a retry.

   Mock only. Nothing here reads the client dashboard's live data. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useToast } from "../shared/Toasts";
import {
  FreelancerApiError,
  getFreelancerKpis,
  listFreelancerEvents,
  listFreelancerVaults,
  subscribe,
  type FreelancerEvent,
  type FreelancerKpis,
  type FreelancerVault,
} from "./mockApi";

interface FreelancerDataValue {
  vaults: FreelancerVault[];
  events: FreelancerEvent[];
  kpis: FreelancerKpis | null;
  loading: boolean;
  error: string | null;
  latestEvent: FreelancerEvent | null;
  clearLatest: () => void;
  reload: () => void;
  /** run a write, reload on success, toast + retry on failure */
  perform: <T>(run: () => Promise<T>, success?: string) => Promise<T | null>;
}

const Ctx = createContext<FreelancerDataValue | null>(null);

export function useFreelancerData(): FreelancerDataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFreelancerData outside its provider");
  return v;
}

const message = (e: unknown) =>
  e instanceof FreelancerApiError ? e.message : "Something went wrong. Try again.";

export function FreelancerDataProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [vaults, setVaults] = useState<FreelancerVault[]>([]);
  const [events, setEvents] = useState<FreelancerEvent[]>([]);
  const [kpis, setKpis] = useState<FreelancerKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestEvent, setLatestEvent] = useState<FreelancerEvent | null>(null);

  const pass = useRef(0);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const mine = ++pass.current;
    setError(null);
    try {
      const [v, e, k] = await Promise.all([listFreelancerVaults(), listFreelancerEvents(), getFreelancerKpis()]);
      if (!alive.current || mine !== pass.current) return;
      setVaults(v);
      setEvents(e);
      setKpis(k);
    } catch (err) {
      if (!alive.current || mine !== pass.current) return;
      setError(message(err));
    } finally {
      if (alive.current && mine === pass.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  /* the mock bus: a new event slides in and the list refetches behind it */
  useEffect(
    () =>
      subscribe((event) => {
        setLatestEvent(event);
        void listFreelancerVaults()
          .then(setVaults)
          .catch(() => {});
        void getFreelancerKpis()
          .then(setKpis)
          .catch(() => {});
        setEvents((prev) => [event, ...prev.filter((e) => e.id !== event.id)].slice(0, 60));
      }),
    []
  );

  const perform = useCallback(
    async <T,>(run: () => Promise<T>, success?: string): Promise<T | null> => {
      try {
        const out = await run();
        await load();
        if (success) toast({ message: success, tone: "success" });
        return out;
      } catch (e) {
        toast({
          message: message(e),
          tone: "error",
          action: { label: "Retry", run: () => void perform(run, success) },
        });
        return null;
      }
    },
    [load, toast]
  );

  const value = useMemo<FreelancerDataValue>(
    () => ({
      vaults,
      events,
      kpis,
      loading,
      error,
      latestEvent,
      clearLatest: () => setLatestEvent(null),
      reload: () => void load(),
      perform,
    }),
    [vaults, events, kpis, loading, error, latestEvent, perform, load]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
