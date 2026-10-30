/* room.tsx — one read of a vault, one check run, one conversation and the three
   writes, held in one place so the files, the chat, the checks and the decision
   panel always agree about where the money is.

   The state machine is the vault's status, nothing else: awaiting_payment locks
   the room, held opens it for the audit, audited opens the decision, unlocked
   hands over the files, voided closes everything. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  approveVault,
  askAI,
  authorizeVault,
  getVaultDetail,
  rejectVault,
  runChecks,
  type ChatMessage,
  type SourceChip,
  type Vault,
  type VaultCheck,
  type VaultDetail,
  type VaultStatus,
} from "../../lib/api";

export type Message = ChatMessage & {
  typing?: boolean;
  streaming?: boolean;
  failed?: boolean;
  /* kept so the bubble can offer the same question again */
  question?: string;
};

interface RoomValue {
  detail: VaultDetail | null;
  vault: Vault | null;
  status: VaultStatus | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;

  checks: VaultCheck[];
  running: boolean;
  runAll: () => Promise<void>;
  progress: number;

  messages: Message[];
  asking: boolean;
  questionsUsed: number;
  questionLimit: number;
  ask: (text: string) => Promise<void>;
  retry: (messageId: string) => Promise<void>;

  busy: "" | "authorize" | "approve" | "reject";
  authorize: () => Promise<void>;
  approve: () => Promise<void>;
  reject: () => Promise<void>;

  /* one pass of motion when files unlock, then cleared */
  unlocking: boolean;
  voiding: boolean;
  capturedAt: number | null;
}

const RoomContext = createContext<RoomValue | null>(null);

let seq = 0;
const uid = (p: string) => `${p}_${(seq++).toString(36)}`;

const CHAR_MS = 25; /* 40 characters a second */

const OPENING =
  "I can inspect this delivery. Ask me anything, or run all checks from the panel on the right.";

export function RoomProvider({ id, children }: { id: string; children: ReactNode }) {
  const [detail, setDetail] = useState<VaultDetail | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [pass, setPass] = useState(0);

  const [checks, setChecks] = useState<VaultCheck[]>([]);
  const [running, setRunning] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [asking, setAsking] = useState(false);
  const [questionsUsed, setQuestionsUsed] = useState(0);

  const [busy, setBusy] = useState<RoomValue["busy"]>("");
  const [unlocking, setUnlocking] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [capturedAt, setCapturedAt] = useState<number | null>(null);

  const timers = useRef<number[]>([]);
  const opened = useRef(false);

  useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
    };
  }, []);

  /* ---------------------------------------------------------------- read --- */

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    getVaultDetail(id)
      .then((next) => {
        if (!live) return;
        setDetail(next);
        setVault(next.vault);
        setChecks(next.checks);
        setQuestionsUsed(next.questionsUsed);
      })
      .catch((e) => {
        if (!live) return;
        setError(e instanceof ApiError ? e : new ApiError("network", "Something went wrong."));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id, pass]);

  const reload = useCallback(() => {
    opened.current = false;
    setPass((n) => n + 1);
  }, []);

  const status = vault?.status ?? null;

  /* ------------------------------------------------------------- streams --- */

  const pushAi = useCallback((text: string, sources: SourceChip[] = [], cached = false) => {
    /* reduced motion reads the answer at once: no dots, no trickle */
    const instant = prefersReduced();
    const message: Message = {
      id: uid("ai"),
      role: "ai",
      text: instant ? text : "",
      sources,
      cached,
      at: Date.now(),
      typing: !instant,
    };
    setMessages((prev) => [...prev, message]);
    return message.id;
  }, []);

  /* typing dots for a beat, then one character at a time */
  const streamInto = useCallback((messageId: string, text: string) => {
    if (prefersReduced()) return;
    const start = window.setTimeout(() => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, typing: false, streaming: true } : m)));
      let i = 0;
      const tick = () => {
        i += 1;
        const slice = text.slice(0, i);
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: slice } : m)));
        if (i < text.length) {
          timers.current.push(window.setTimeout(tick, CHAR_MS));
        } else {
          setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, streaming: false } : m)));
        }
      };
      tick();
    }, 618);
    timers.current.push(start);
  }, []);

  /* the opening line, once the room is readable */
  useEffect(() => {
    if (!detail || opened.current) return;
    if (detail.vault.status === "awaiting_payment" || detail.vault.status === "voided") return;
    opened.current = true;
    const messageId = pushAi(OPENING, [], false);
    streamInto(messageId, OPENING);
  }, [detail, pushAi, streamInto]);

  /* --------------------------------------------------------------- checks --- */

  const runAll = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setChecks((prev) => prev.map((c) => ({ ...c, state: "queued" })));
    try {
      const results = await runChecks(id, (checkId, state) => {
        setChecks((prev) => prev.map((c) => (c.id === checkId ? { ...c, state } : c)));
      });
      setChecks(results);
      /* runChecks already marked the vault audited on the server */
      setVault((v) => (v ? { ...v, status: "audited" } : v));
      const passed = results.filter((r) => r.result === "pass").length;
      const warned = results.filter((r) => r.result === "warn").length;
      const failed = results.filter((r) => r.result === "fail").length;
      const line = `The audit is done. ${passed} of ${results.length} passed${
        warned ? `, ${warned} warning${warned === 1 ? "" : "s"}` : ""
      }${failed ? `, ${failed} failed` : ""}. ${results.map((r) => `${r.name}: ${r.detail}.`).join(" ")}`;
      const messageId = pushAi(line, [], false);
      streamInto(messageId, line);
    } catch (e) {
      setChecks((prev) => prev.map((c) => (c.state === "running" ? { ...c, state: "queued" } : c)));
      throw e;
    } finally {
      setRunning(false);
    }
  }, [id, pushAi, running, streamInto]);

  const progress = useMemo(() => {
    if (!checks.length) return 0;
    const settled = checks.filter((c) => c.state === "pass" || c.state === "warn" || c.state === "fail").length;
    return settled / checks.length;
  }, [checks]);

  /* ----------------------------------------------------------------- chat --- */

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || asking) return;
      setMessages((prev) => [
        ...prev,
        { id: uid("me"), role: "user", text: question, sources: [], cached: false, at: Date.now() },
      ]);
      setAsking(true);
      const answerId = uid("ai");
      setMessages((prev) => [
        ...prev,
        { id: answerId, role: "ai", text: "", sources: [], cached: false, at: Date.now(), typing: true, question },
      ]);
      try {
        /* the api trickles the answer: each token appends straight to the
           bubble, so the caret moves at the mock's 40 characters a second */
        let text = "";
        const res = await askAI(id, question, (chunk) => {
          text += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === answerId ? { ...m, typing: false, streaming: true, text } : m))
          );
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === answerId ? { ...m, streaming: false, sources: res.sources, cached: res.cached } : m
          )
        );
        setQuestionsUsed((n) => n + 1);
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "The agent did not answer.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === answerId ? { ...m, typing: false, streaming: false, failed: true, text: message } : m
          )
        );
      } finally {
        setAsking(false);
      }
    },
    [asking, id]
  );

  /* the retry inside a failed bubble asks the same question once more */
  const retry = useCallback(
    async (messageId: string) => {
      const target = messages.find((m) => m.id === messageId);
      if (!target?.question) return;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      await ask(target.question);
    },
    [ask, messages]
  );

  /* --------------------------------------------------------------- writes --- */

  const authorize = useCallback(async () => {
    if (busy) return;
    setBusy("authorize");
    try {
      const next = await authorizeVault(id);
      setVault(next);
      opened.current = true;
      const messageId = pushAi(OPENING, [], false);
      streamInto(messageId, OPENING);
    } finally {
      setBusy("");
    }
  }, [busy, id, pushAi, streamInto]);

  const approve = useCallback(async () => {
    if (busy) return;
    setBusy("approve");
    try {
      const next = await approveVault(id);
      setVault(next);
      setCapturedAt(Date.now());
      setUnlocking(true);
      window.setTimeout(() => setUnlocking(false), 1618);
      const line = "Payment captured. Files are unlocked.";
      const messageId = pushAi(line, [], false);
      streamInto(messageId, line);
    } finally {
      setBusy("");
    }
  }, [busy, id, pushAi, streamInto]);

  const reject = useCallback(async () => {
    if (busy) return;
    setBusy("reject");
    try {
      const next = await rejectVault(id);
      setVault(next);
      setVoiding(true);
    } finally {
      setBusy("");
    }
  }, [busy, id]);

  const value = useMemo<RoomValue>(
    () => ({
      detail,
      vault,
      status,
      loading,
      error,
      reload,
      checks,
      running,
      runAll,
      progress,
      messages,
      asking,
      questionsUsed,
      questionLimit: detail?.questionLimit ?? 15,
      ask,
      retry,
      busy,
      authorize,
      approve,
      reject,
      unlocking,
      voiding,
      capturedAt,
    }),
    [
      detail,
      vault,
      status,
      loading,
      error,
      reload,
      checks,
      running,
      runAll,
      progress,
      messages,
      asking,
      questionsUsed,
      ask,
      retry,
      busy,
      authorize,
      approve,
      reject,
      unlocking,
      voiding,
      capturedAt,
    ]
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomValue {
  const value = useContext(RoomContext);
  if (!value) throw new Error("useRoom outside RoomProvider");
  return value;
}

/* the reduced-motion switch, read once per render pass */
export const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
