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
import { API_BASE_URL, apiClient, isDemoMode } from "../../lib/apiClient";
import { listEvents as listLocalEvents, listVaults as listLocalVaults } from "../../lib/api";
import { fetchVaults as fetchRealVaults, kpisOf, pollDelay, shouldPoll } from "../../lib/reads";
import { realOn } from "../../config/fx";

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
  /* the bearer token is memory-only, held by the http client */
  return apiClient.getToken() ?? "";
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
      /* the real id the server recorded, or nothing: a receipt must never print
         a string this browser invented */
      paypalOrderId: bv.paypalOrderId ?? bv.paypal_order_id ?? undefined,
    };
  });
}

/* Only the five events the client ledger draws are events here. A row whose type
   has no client meaning (a creation, an upload, a payout) used to fall through
   to PAYMENT.AUTHORIZED, so every vault appeared twice: once for its real
   authorization and once for its creation, with the same amount and a
   fabricated id. Unmapped rows are dropped instead. */
const LEDGER_TYPE: Readonly<Record<string, LedgerType>> = {
  FUNDS_AUTHORIZED: "PAYMENT.AUTHORIZED",
  PAYMENT_CAPTURED: "PAYMENT.CAPTURED",
  VAULT_CANCELLED: "PAYMENT.VOIDED",
  FILES_UNLOCKED: "FILES.UNLOCKED",
  MILESTONE_APPROVED: "FILES.UNLOCKED",
  AUDIT_COMPLETED: "AUDIT.COMPLETED",
};

async function fetchLiveLedger(): Promise<LedgerEvent[]> {
  if (isDemoMode()) return listLocalEvents();
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/ledger`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch ledger from server");
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];

  const events: LedgerEvent[] = [];
  for (const e of json.data as any[]) {
    const type = LEDGER_TYPE[String(e.event_type ?? "").trim().toUpperCase()];
    if (!type) continue;
    const id = String(e.id ?? "");
    if (!id) continue;

    events.push({
      id,
      ts: new Date(e.created_at || Date.now()).getTime(),
      type,
      vaultId: String(e.vault_id ?? ""),
      label: e.metadata?.note || "Ledger event recorded",
      amountUSD: Number(e.amount) || undefined,
      /* the real id the server recorded, never a guess at one */
      paypalId:
        e.metadata?.authorizationId || e.metadata?.captureId || e.metadata?.orderId || e.metadata?.paypalId || undefined,
    });
  }

  return events;
}

async function fetchEvents(): Promise<LedgerEvent[]> {
  /* GET /api/ledger answers with every user's last fifty rows, so using it would
     put other people's money in a client's ledger. Until it is scoped, events
     come from the local store in a demo build and from nowhere in a real one:
     an empty ledger is honest, a stranger's row is not. */
  if (realOn("events")) return fetchLiveLedger();
  return isDemoMode() ? listLocalEvents() : [];
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
  /* the rows the poller last saw, so its timer does not restart on every render */
  const vaultsRef = useRef<Vault[]>([]);
  const readsReal = realOn("vaultsRead");

  useEffect(() => {
    let live = true;
    if (!haveData.current) setLoading(true);
    setError(null);

    Promise.all([readsReal ? fetchRealVaults() : fetchLiveVaults(), fetchEvents()])
      .then(([nextVaults, nextEvents]) => {
        if (!live) return;
        vaultsRef.current = nextVaults;
        setVaults(nextVaults);
        setEvents(nextEvents);
        /* the same cent selectors the Payments page reads, so the three totals
           cannot drift apart */
        setKpis(readsReal ? kpisOf(nextVaults) : calculateKpis(nextVaults));
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
  }, [pass, readsReal]);

  /* Slice 5: a visible page refreshes every 5s while something is still moving,
     backing off to 15s after three failures in a row. A hidden tab, or a page
     whose vaults are all terminal, stops asking. */
  useEffect(() => {
    if (!readsReal) return;
    let timer = 0;
    let errors = 0;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      timer = window.setTimeout(tick, pollDelay(errors));
    };

    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (!shouldPoll(vaultsRef.current)) return;
      try {
        const next = await fetchRealVaults();
        errors = 0;
        vaultsRef.current = next;
        setVaults(next);
        setKpis(kpisOf(next));
      } catch {
        errors += 1;
      }
      schedule();
    };

    const onVisible = () => {
      if (stopped || document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [readsReal]);

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
      vaultsRef.current = next;
      setKpis(readsReal ? kpisOf(next) : calculateKpis(next));
      return next;
    });
    // Also trigger a reload from the backend so KPIs and ledger sync
    setTimeout(() => setPass((n) => n + 1), 500);
  }, [readsReal]);

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
