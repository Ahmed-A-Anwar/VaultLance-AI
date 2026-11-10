/* FreelancerData.tsx — one provider, one subscription, and separate loading and
   error state for the vault list and the ledger. Reads are allowed to fail (the
   mock fails 5% of them on purpose), so each section carries its own retry
   rather than a fallback value. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { hasPayoutEmail } from "../../lib/api";
import { getPayoutProfile } from "../payments/paymentsApi";
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
  vaultsLoading: boolean;
  ledgerLoading: boolean;
  vaultsError: string | null;
  ledgerError: string | null;
  paypalMissing: boolean;
  refresh: () => Promise<void>;
  refreshVaults: () => Promise<void>;
  refreshLedger: () => Promise<void>;
  applyVault: (v: FreelancerVault) => void;
  dropVault: (id: string) => void;
  noteEvent: (e: FreelancerEvent) => void;
}

const Ctx = createContext<Value | null>(null);

export function FreelancerDataProvider({ children }: { children: ReactNode }) {
  const [vaults, setVaults] = useState<FreelancerVault[]>([]);
  const [events, setEvents] = useState<FreelancerEvent[]>([]);
  const [kpis, setKpis] = useState<FreelancerKpis | null>(null);
  const [vaultsLoading, setVaultsLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [vaultsError, setVaultsError] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [paypalMissing, setPaypalMissing] = useState(false);
  const alive = useRef(true);
  const haveVaults = useRef(false);
  const haveLedger = useRef(false);
  const vaultsRef = useRef<FreelancerVault[]>([]);

  const refreshVaults = useCallback(async () => {
    if (!haveVaults.current) setVaultsLoading(true);
    setVaultsError(null);

    try {
      if (isDemoMode()) {
        const [v, k] = await Promise.all([demoVaults(), demoKpis()]);
        if (!alive.current) return;
        vaultsRef.current = v;
        setVaults(v);
        setKpis(k);
      } else {
        const v = await liveVaults();
        if (!alive.current) return;
        vaultsRef.current = v;
        setVaults(v);
        setKpis(kpisFor(v));
      }
      haveVaults.current = true;
    } catch (err) {
      if (!alive.current) return;
      setVaultsError(err instanceof Error ? err.message : "The vault service didn’t answer.");
    } finally {
      if (alive.current) setVaultsLoading(false);
    }
  }, []);

  const refreshLedger = useCallback(async () => {
    if (!haveLedger.current) setLedgerLoading(true);
    setLedgerError(null);

    try {
      /* a ledger read is scoped to the vaults currently on screen; it never
         decides whether that list is allowed to appear */
      const nextEvents = isDemoMode() ? await demoEvents() : await liveEvents(vaultsRef.current);
      if (!alive.current) return;
      setEvents(nextEvents);
      haveLedger.current = true;
    } catch (err) {
      if (!alive.current) return;
      setLedgerError(err instanceof Error ? err.message : "The ledger service didn’t answer.");
    } finally {
      if (alive.current) setLedgerLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await refreshVaults();
    if (!alive.current) return;
    await refreshLedger();
    if (!alive.current) return;

    if (isDemoMode()) {
      setPaypalMissing(!hasPayoutEmail());
    } else {
      /* the banner reads the account's stored payout address, the same value
         Settings and the Payments card read; a failed read leaves it alone */
      try {
        const profile = await getPayoutProfile();
        if (alive.current) setPaypalMissing(!profile.paypalEmail);
      } catch {
        /* the vault list still loads; the banner keeps its last answer */
      }
    }
  }, [refreshVaults, refreshLedger]);

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
    setVaults((prev) => {
      const next = prev.map((row) => (row.id === v.id ? v : row));
      vaultsRef.current = next;
      return next;
    });
  }, []);

  const dropVault = useCallback((id: string) => {
    setVaults((prev) => {
      const next = prev.filter((row) => row.id !== id);
      vaultsRef.current = next;
      return next;
    });
  }, []);

  const noteEvent = useCallback((e: FreelancerEvent) => {
    setEvents((prev) => (prev.some((row) => row.id === e.id) ? prev : [e, ...prev]));
  }, []);

  const value = useMemo<Value>(
    () => ({
      vaults,
      events,
      kpis,
      vaultsLoading,
      ledgerLoading,
      vaultsError,
      ledgerError,
      paypalMissing,
      refresh,
      refreshVaults,
      refreshLedger,
      applyVault,
      dropVault,
      noteEvent,
    }),
    [
      vaults,
      events,
      kpis,
      vaultsLoading,
      ledgerLoading,
      vaultsError,
      ledgerError,
      paypalMissing,
      refresh,
      refreshVaults,
      refreshLedger,
      applyVault,
      dropVault,
      noteEvent,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFreelancerData(): Value {
  const value = useContext(Ctx);
  if (!value) throw new Error("useFreelancerData must be used inside FreelancerDataProvider");
  return value;
}
