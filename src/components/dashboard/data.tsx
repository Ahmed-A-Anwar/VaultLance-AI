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
import { useToast } from "../shared/Toasts";
import { realOn } from "../../config/fx";

interface DashDataValue {
  vaults: Vault[];
  events: LedgerEvent[];
  kpis: Kpis | null;
  vaultsLoading: boolean;
  ledgerLoading: boolean;
  vaultsError: ApiError | null;
  ledgerError: ApiError | null;
  reload: () => void;
  reloadVaults: () => void;
  reloadLedger: () => void;
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

/* One quiet line for the poller's additions. A full list refresh can carry
   several invitations at once, so say the count rather than naming one. */
function newVaultNotice(previous: Vault[], next: Vault[]): string | null {
  const known = new Set(previous.map((v) => v.id));
  const added = next.filter((v) => !known.has(v.id));
  if (added.length === 0) return null;
  if (added.length === 1) return `New vault: ${added[0].project}.`;
  return `${added.length} new vaults were added.`;
}

export function DashDataProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [vaultsLoading, setVaultsLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [vaultsError, setVaultsError] = useState<ApiError | null>(null);
  const [ledgerError, setLedgerError] = useState<ApiError | null>(null);
  const [latestEvent, setLatestEvent] = useState<LedgerEvent | null>(null);
  const [vaultsPass, setVaultsPass] = useState(0);
  const [ledgerPass, setLedgerPass] = useState(0);

  /* one flag per section: a retry of one read must not skeleton the other */
  const haveVaults = useRef(false);
  const haveLedger = useRef(false);
  /* the rows the poller last saw, so its timer does not restart on every render */
  const vaultsRef = useRef<Vault[]>([]);
  const readsReal = realOn("vaultsRead");

  useEffect(() => {
    let live = true;
    if (!haveVaults.current) setVaultsLoading(true);
    setVaultsError(null);

    (readsReal ? fetchRealVaults() : fetchLiveVaults())
      .then((nextVaults) => {
        if (!live) return;
        vaultsRef.current = nextVaults;
        setVaults(nextVaults);
        /* the same cent selectors the Payments page reads, so the three totals
           cannot drift apart */
        setKpis(readsReal ? kpisOf(nextVaults) : calculateKpis(nextVaults));
        haveVaults.current = true;
      })
      .catch((e) => {
        if (!live) return;
        setVaultsError(asApiError(e));
      })
      .finally(() => {
        if (live) setVaultsLoading(false);
      });

    return () => {
      live = false;
    };
  }, [vaultsPass, readsReal]);

  useEffect(() => {
    let live = true;
    if (!haveLedger.current) setLedgerLoading(true);
    setLedgerError(null);

    fetchEvents()
      .then((nextEvents) => {
        if (!live) return;
        setEvents(nextEvents);
        haveLedger.current = true;
      })
      .catch((e) => {
        if (!live) return;
        setLedgerError(asApiError(e));
      })
      .finally(() => {
        if (live) setLedgerLoading(false);
      });

    return () => {
      live = false;
    };
  }, [ledgerPass]);

  /* A visible page refreshes every 5s while something is still moving. An idle
     page still checks every 15s for a newly invited vault: membership can change
     on another device, so stopping here would require a reload to see it. The
     poll backs off after failures and refreshes immediately on visibility. */
  useEffect(() => {
    if (!readsReal) return;
    let timer = 0;
    let errors = 0;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      timer = window.setTimeout(tick, pollDelay(errors, shouldPoll(vaultsRef.current)));
    };

    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      /* Only a poll that started after the initial read can announce an
         addition: otherwise the first paint would toast every existing vault. */
      const primed = haveVaults.current;
      const previous = vaultsRef.current;
      try {
        const next = await fetchRealVaults();
        errors = 0;
        if (primed) {
          const notice = newVaultNotice(previous, next);
          if (notice) toast({ message: notice, tone: "info" });
        }
        vaultsRef.current = next;
        setVaults(next);
        setKpis(kpisOf(next));
      } catch {
        errors += 1;
      }
      schedule();
    };

    const refreshNow = () => {
      if (stopped || document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      void tick();
    };

    schedule();
    document.addEventListener("visibilitychange", refreshNow);
    window.addEventListener("focus", refreshNow);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshNow);
      window.removeEventListener("focus", refreshNow);
    };
  }, [readsReal, toast]);

  useEffect(
    () =>
      subscribe((event) => {
        setLatestEvent(event);
        setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [event, ...prev]));
        setVaultsPass((n) => n + 1);
        setLedgerPass((n) => n + 1);
      }),
    []
  );

  const reload = useCallback(() => {
    haveVaults.current = false;
    haveLedger.current = false;
    setVaultsPass((n) => n + 1);
    setLedgerPass((n) => n + 1);
  }, []);

  const reloadVaults = useCallback(() => {
    haveVaults.current = false;
    setVaultsPass((n) => n + 1);
  }, []);

  const reloadLedger = useCallback(() => {
    haveLedger.current = false;
    setLedgerPass((n) => n + 1);
  }, []);

  const putVault = useCallback((vault: Vault) => {
    setVaults((prev) => {
      const next = prev.map((v) => (v.id === vault.id ? vault : v));
      vaultsRef.current = next;
      setKpis(readsReal ? kpisOf(next) : calculateKpis(next));
      return next;
    });
    // Also trigger a reload from the backend so KPIs and ledger sync
    setTimeout(() => {
      setVaultsPass((n) => n + 1);
      setLedgerPass((n) => n + 1);
    }, 500);
  }, [readsReal]);

  const clearLatest = useCallback(() => setLatestEvent(null), []);

  const value = useMemo<DashDataValue>(
    () => ({
      vaults,
      events,
      kpis,
      vaultsLoading,
      ledgerLoading,
      vaultsError,
      ledgerError,
      reload,
      reloadVaults,
      reloadLedger,
      putVault,
      latestEvent,
      clearLatest,
    }),
    [
      vaults,
      events,
      kpis,
      vaultsLoading,
      ledgerLoading,
      vaultsError,
      ledgerError,
      reload,
      reloadVaults,
      reloadLedger,
      putVault,
      latestEvent,
      clearLatest,
    ]
  );

  return <DashDataContext.Provider value={value}>{children}</DashDataContext.Provider>;
}

export function useDashData(): DashDataValue {
  const value = useContext(DashDataContext);
  if (!value) throw new Error("useDashData outside DashDataProvider");
  return value;
}
