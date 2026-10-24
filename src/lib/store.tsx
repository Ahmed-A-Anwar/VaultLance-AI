import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SANDBOX_TXN, SEED, type VaultFile } from "./seed";
import type { ManifestItem } from "./hash";

/* Money states — one token each, identical everywhere (PLAN §1 rules) */
export type MoneyState = "SEALED" | "AUDITING" | "HELD" | "CAPTURED" | "VOIDED" | "RELEASED" | "PAID";

export interface LedgerEvent {
  at: number;                 // epoch ms
  state: MoneyState;          // the money state this event committed
  src: string;                // what produced it
  computed: string;           // COMPUTED: machine fact (mono)
  judged?: string;            // JUDGED: the AI's call (sans)
  latencyMs: number;
}
export interface LedgerRow extends LedgerEvent { vaultId: string }
export enum Filter { All = "All", Live = "Live only" }

export interface Vault {
  id: string;
  token: string;
  title: string;
  amountCents: number;
  brief: string;
  stagingUrl?: string;
  client?: string;
  freelancer?: string;
  files: VaultFile[];
  state: MoneyState;
  events: LedgerEvent[];
  sandbox: { authId: string; captureId: string; createdAt: string };
}

const now = () => Date.now();
const lat = () => 37 + Math.floor(Math.random() * 40);
const ev = (state: MoneyState, src: string, computed: string, judged?: string, at = now()): LedgerEvent =>
  ({ at, state, src, computed, judged, latencyMs: lat() });

function seedVault(): Vault {
  const t0 = new Date(SANDBOX_TXN.createdAt).getTime();
  return {
    ...SEED.vault,
    state: "HELD",
    sandbox: SANDBOX_TXN,
    events: [
      ev("SEALED", "zip intake", `5 rows sealed · 155,824 B total · sha256 local`, `${SEED.vault.files.length} paths, brief 1 line`, t0),
      ev("HELD", "auth (sandbox)", `authorization ${SANDBOX_TXN.authId} reserved $4,250.00 — not captured`, "held pending audit", t0 + 1200),
    ],
  };
}

interface Store {
  vaults: Record<string, Vault>;
  ledger: LedgerRow[];
  createVault: (input: { title: string; amountCents: number; brief: string; stagingUrl?: string; files: ManifestItem[] }) => Vault;
  patch: (id: string, mut: (v: Vault) => Vault) => void;
  approve: (id: string) => void;
  startReplay: () => void;
  replayTick: number;
  interactive: boolean;     // false until a demo CTA arms the seeded replay
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const asSeed = () => ({ [SEED.vault.id]: seedVault() });
  const [vaults, setVaults] = useState<Record<string, Vault>>(asSeed);
  const [interactive, setInteractive] = useState(false);
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  const createVault: Store["createVault"] = (input) => {
    const id = `vp_${Math.random().toString(36).slice(2, 10)}`;
    const token = Array.from({ length: 12 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
    const sandbox = { authId: `9A${Math.random().toString(36).slice(2, 14).toUpperCase()}`, captureId: "—", createdAt: new Date().toISOString() };
    const v: Vault = {
      id, token, sandbox, state: "SEALED",
      title: input.title, amountCents: input.amountCents, brief: input.brief,
      stagingUrl: input.stagingUrl, files: input.files as VaultFile[],
      events: [ev("SEALED", "zip intake", `${input.files.length} rows sealed · ${input.files.reduce((n, f) => n + f.size, 0)} B`, "held pending audit")],
    };
    setVaults((prev) => ({ ...prev, [id]: v }));
    setInteractive(true);
    return v;
  };

  /* Lifecycle engine: SEALED → AUDITING → … → PAID. In a real deploy these are
     PayPal webhooks; here they are the same events, arriving on timers. */
  const patch: Store["patch"] = (id, mut) =>
    setVaults((prev) => prev[id] ? { ...prev, [id]: mut(prev[id]) } : prev);

  const approve: Store["approve"] = (id) => {
    const t = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    const seq: [number, () => void][] = [
      [0, () => patch(id, (v) => ({ ...v, state: "CAPTURED" }))],
      [1400, () => patch(id, (v) => ({ ...v,
        state: "RELEASED",
        sandbox: { ...v.sandbox, captureId: `9CR${Math.random().toString(36).slice(2, 12).toUpperCase()}` },
        events: [...v.events, ev("CAPTURED", "capture (sandbox)", `capture ${v.sandbox.authId} fired $${(v.amountCents / 100).toFixed(2)}`, "approved — files released")] })),
      ],
      [2600, () => patch(id, (v) => ({ ...v,
        state: "PAID",
        events: [...v.events, ev("PAID", "payout (sandbox)", `${v.amountCents}¢ to ${v.freelancer ?? "freelancer"} · txn live`, "paid")] })),
      ],
    ];
    seq.forEach(([ms, fn]) => t(fn, ms));
  };

  /* Replayed lifecycle for /demo + landing CTA: the same events on timers —
     each append drives every subscribed surface (portal, console, detail). */
  const [replayTick, setReplayTick] = useState(0);
  useEffect(() => {
    if (!interactive) return; // seeded surfaces replay only when entered from a demo CTA
    clear();
    const seedId = SEED.vault.id;
    const t = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(() => { fn(); setReplayTick((n) => n + 1); }, ms));
    t(() => patch(seedId, (v) => ({ ...v, state: "AUDITING", events: [...v.events, ev("AUDITING", "audit engine", "5 rows re-hashed · test runner engaged", "reading the manifest")] })), 800);
    t(() => patch(seedId, (v) => ({ ...v, events: [...v.events, ev("AUDITING", "verdict draft", "COMPUTED 4 · WARN 1", "refund coverage — judged, not computed")] })), 2000);
    t(() => patch(seedId, (v) => ({ ...v, state: "CAPTURED", events: [...v.events, ev("CAPTURED", "capture (sandbox)", `capture ${v.sandbox.authId} fired $4,250.00 — replay`, "client auto-approves in the demo")] })), 4000);
    t(() => patch(seedId, (v) => ({ ...v, state: "RELEASED", events: [...v.events, ev("RELEASED", "webhook", "capture.completed · manifest → RELEASED", "files unlocked")] })), 5200);
    t(() => patch(seedId, (v) => ({ ...v, state: "PAID", events: [...v.events, ev("PAID", "payout (sandbox)", "payout appended · ledger final", "paid — demo ends")] })), 6400);
    setReplayTick((n) => n + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  const ledger = useMemo(() =>
    Object.values(vaults).flatMap((v) => v.events.map((e) => ({ ...e, vaultId: v.id })))
      .sort((a, b) => b.at - a.at), [vaults, replayTick]);

  const value = { vaults, ledger, createVault, patch, approve, startReplay: () => setInteractive(true), replayTick, interactive };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const store = useContext(Ctx);
  if (!store) throw new Error("useStore outside provider");
  return store;
}
export const useVault = (id: string) => useStore().vaults[id];
