/* data.tsx — Live data provider for the whole dashboard connected to backend & Supabase. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  subscribe,
  type Kpis,
  type LedgerEvent,
  type Vault,
  type VaultStatus,
  type LedgerType,
} from "../../lib/api";
import { API_BASE_URL, isDemoMode } from "../../lib/apiClient";
import { listEvents as listLocalEvents, listVaults as listLocalVaults } from "../../lib/api";

interface DashDataValue {
  vaults: Vault[];
  events: LedgerEvent[];
  kpis: Kpis | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
  putVault: (vault: Vault) => void;
  latestEvent: LedgerEvent | null;
  clearLatest: () => void;
}

const DashDataContext = createContext<DashDataValue | null>(null);

const asApiError = (e: unknown): ApiError =>
  e instanceof ApiError ? e : new ApiError("network", "Something went wrong. Try again.");

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("vl_token") || sessionStorage.getItem("vl_token") || "";
}

async function fetchLiveVaults(): Promise<Vault[]> {
  /* a demo build has no server to ask, so it reads the local store the same
     surfaces write to */
  if (isDemoMode()) return listLocalVaults();
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/vaults`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch vaults from server");
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];

  return json.data.map((bv: any): Vault => {
    let status: VaultStatus = "held";
    const s = (bv.status || "").toUpperCase();
    if (["DRAFT", "AWAITING_CLIENT", "AWAITING_AUTHORIZATION"].includes(s)) status = "awaiting_payment";
    else if (["AUTHORIZED", "FUNDS_HELD"].includes(s)) status = "held";
    else if (["AWAITING_APPROVAL", "SUBMITTED", "VERIFYING"].includes(s)) status = "audited";
    else if (["PAID", "CAPTURE_PENDING", "COMPLETED", "UNLOCKED"].includes(s)) status = "unlocked";
    else if (["CANCELLED", "EXPIRED", "VOIDED"].includes(s)) status = "voided";

    const freelancer = bv.members?.find((m: any) => m.role === "FREELANCER")?.fullName || "Freelancer";
    return {
      id: bv.id,
      project: bv.title,
      freelancer,
      amountUSD: Number(bv.amount) || 0,
      status,
      createdAt: new Date(bv.createdAt || bv.created_at || Date.now()).getTime(),
      paypalOrderId: bv.id ? `8XK${bv.id.slice(0, 8).toUpperCase()}` : undefined,
    };
  });
}

async function fetchLiveLedger(): Promise<LedgerEvent[]> {
  if (isDemoMode()) return listLocalEvents();
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/ledger`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch ledger from server");
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];

  return json.data.map((e: any): LedgerEvent => {
    let type: LedgerType = "PAYMENT.AUTHORIZED";
    if (e.event_type === "PAYMENT_CAPTURED") type = "PAYMENT.CAPTURED";
    else if (e.event_type === "MILESTONE_APPROVED") type = "FILES.UNLOCKED";
    else if (e.event_type === "FUNDS_AUTHORIZED") type = "PAYMENT.AUTHORIZED";
    else if (e.event_type === "VAULT_CANCELLED") type = "PAYMENT.VOIDED";
    return {
      id: e.id,
      ts: new Date(e.created_at || Date.now()).getTime(),
      type,
      vaultId: e.vault_id,
      label: e.metadata?.note || "Ledger event recorded",
      amountUSD: Number(e.amount) || undefined,
      paypalId: e.metadata?.paypalId || `8XK${e.vault_id?.slice(0, 8).toUpperCase()}`,
    };
  });
}

function calculateKpis(vList: Vault[]): Kpis {
  const held = vList.filter((v) => v.status === "held" || v.status === "audited");
  return {
    fundsHeld: held.reduce((sum, v) => sum + v.amountUSD, 0),
    awaitingReview: vList.filter((v) => v.status === "audited").length,
    unlocked: vList.filter((v) => v.status === "unlocked").length,
  };
}

export function DashDataProvider({ children }: { children: ReactNode }) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [latestEvent, setLatestEvent] = useState<LedgerEvent | null>(null);
  const [pass, setPass] = useState(0);

  const haveData = useRef(false);

  useEffect(() => {
    let live = true;
    if (!haveData.current) setLoading(true);
    setError(null);

    Promise.all([fetchLiveVaults(), fetchLiveLedger()])
      .then(([nextVaults, nextEvents]) => {
        if (!live) return;
        setVaults(nextVaults);
        setEvents(nextEvents);
        setKpis(calculateKpis(nextVaults));
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
    setVaults((prev) => {
      const next = prev.map((v) => (v.id === vault.id ? vault : v));
      setKpis(calculateKpis(next));
      return next;
    });
    // Also trigger a reload from the backend so KPIs and ledger sync
    setTimeout(() => setPass((n) => n + 1), 500);
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
