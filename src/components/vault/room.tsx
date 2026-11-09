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
  getAuditReport,
  authorizeVault,
  getVaultDetail,
  rejectVault,
  requestRevision as requestRevisionApi,
  runChecks,
  type ChatMessage,
  type FailedCheck,
  type SourceChip,
  type Vault,
  type VaultCheck,
  type VaultDetail,
  type VaultStatus,
  type WaivedCheck,
  type WaiverRequest,
} from "../../lib/api";
import { getAccessToken } from "../../lib/http";
import { authorizePaypalOrder, reconcilePaypalOrder } from "../../lib/paypalWrites";
import {
  approvalFromUrl,
  cleanPaypalQuery,
  forgetApprovedOrder,
  pendingApprovalFor,
  rememberApprovedOrder,
} from "../../lib/paypalReturn";

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

  /* PayPal sent the buyer back with an approved order, and this window has no
     session to finish it with: the UI says so instead of showing a 401 */
  approvedPending: boolean;

  checks: VaultCheck[];
  /* what the server recorded as failed, and what was waived at approval */
  failedChecks: FailedCheck[];
  waivedChecks: WaivedCheck[];
  revisionNote: string | null;
  running: boolean;
  runAll: () => Promise<VaultCheck[]>;
  progress: number;

  messages: Message[];
  asking: boolean;
  questionsUsed: number;
  questionLimit: number;
  ask: (text: string) => Promise<void>;
  retry: (messageId: string) => Promise<void>;

  busy: "" | "authorize" | "approve" | "reject" | "revision";
  authorize: () => Promise<void>;
  approve: (waivers?: WaiverRequest[]) => Promise<void>;
  requestRevision: (note?: string) => Promise<void>;
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
  "I can inspect this delivery. Ask me anything, or run the audit checks.";

export function RoomProvider({ id, children }: { id: string; children: ReactNode }) {
  const [detail, setDetail] = useState<VaultDetail | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [pass, setPass] = useState(0);

  const [checks, setChecks] = useState<VaultCheck[]>([]);
  const [failedChecks, setFailedChecks] = useState<FailedCheck[]>([]);
  const [waivedChecks, setWaivedChecks] = useState<WaivedCheck[]>([]);
  const [revisionNote, setRevisionNote] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [asking, setAsking] = useState(false);
  const [questionsUsed, setQuestionsUsed] = useState(0);

  const [busy, setBusy] = useState<RoomValue["busy"]>("");
  const [unlocking, setUnlocking] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [capturedAt, setCapturedAt] = useState<number | null>(null);
  /* seeded from the saved order, not from the address: the room page records a
     PayPal return and strips the query before this provider ever mounts, so
     reading window.location here would always miss it */
  const [approvedPending, setApprovedPending] = useState(() => Boolean(pendingApprovalFor(id)));
  const finishing = useRef(false);

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
        setFailedChecks(next.failedChecks);
        setWaivedChecks(next.waivedChecks);
        setRevisionNote(next.revisionNote);
        setQuestionsUsed(next.questionsUsed);
        if (next.messages.length > 0) {
          /* the server kept the conversation: show it instead of starting with
             the canned opening line, and never append a second one */
          opened.current = true;
          setMessages(next.messages);
        }
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

  /* --------------------------------------------------- paypal's return --- */

  /* PayPal lands on ?status=authorized&token=<orderId>. Remember the order, so
     whichever window has a session can finish it, and take it out of the
     address rather than leaving a PayPal id in the URL bar. */
  useEffect(() => {
    const fromUrl = approvalFromUrl(window.location.href);
    if (!fromUrl || fromUrl.vaultId !== id) return;
    rememberApprovedOrder(id, fromUrl.orderId);
    cleanPaypalQuery(id);
    setApprovedPending(true);
  }, [id]);

  /* Whoever holds a session completes the authorization the buyer granted. It is
     retried a few times because the page can arrive a beat before PayPal has
     marked the order approved, and that first attempt failing used to leave the
     vault unclaimed until someone focused the tab. */
  useEffect(() => {
    if (!getAccessToken()) return;
    const pending = pendingApprovalFor(id);
    if (!pending) return;
    /* once the vault has a hold, there is nothing left to authorize */
    if (vault && vault.status !== "awaiting_payment") {
      forgetApprovedOrder(id);
      setApprovedPending(false);
      return;
    }
    if (finishing.current) return;

    let cancelled = false;
    let timer = 0;
    let attempt = 0;

    const attemptOnce = async () => {
      attempt += 1;
      try {
        await authorizePaypalOrder(id, pending.orderId);
        if (cancelled) return;
        forgetApprovedOrder(id);
        setApprovedPending(false);
        reload();
      } catch {
        /* not approved yet, or the wrong account: try again, then stay pending */
        if (!cancelled && attempt < 5) timer = window.setTimeout(() => void attemptOnce(), 3000);
        return;
      } finally {
        if (!cancelled && attempt >= 5) finishing.current = false;
      }
      finishing.current = false;
    };

    finishing.current = true;
    void attemptOnce();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      finishing.current = false;
    };
  }, [id, vault, reload]);

  /* Opening a vault that is still waiting for a hold asks the server whether
     PayPal already has the approval. A single check wasn't enough: an approval
     can land ten seconds after the room opens, or in another tab while this one
     sits idle. Keep asking while the vault is unfunded, and wake immediately on
     focus so a return from PayPal never leaves the room stale. */
  useEffect(() => {
    if (!getAccessToken() || vault?.status !== "awaiting_payment") return;

    let live = true;
    let inFlight = false;

    const check = async () => {
      if (!live || inFlight) return;
      inFlight = true;
      try {
        const res = await reconcilePaypalOrder(id);
        /* reconcile answers with a status when the vault already moved on
           (a webhook can claim the hold first); reload even then */
        if (live && (res.claimed || res.status)) reload();
      } catch {
        /* no approval yet, or the order is not readable yet: try again */
      } finally {
        inFlight = false;
      }
    };

    void check();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void check();
    }, 8000);
    const wake = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);

    return () => {
      live = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [id, vault?.status, reload]);

  /* coming back to a tab after approving in another window finishes the hold */
  useEffect(() => {
    const wake = () => {
      if (!getAccessToken() || !pendingApprovalFor(id)) return;
      reload();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [id, reload]);

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
    if (running) return [];
    setRunning(true);
    setChecks((prev) => prev.map((c) => ({ ...c, state: "queued" })));
    try {
      const results = await runChecks(id, (checkId, state) => {
        setChecks((prev) => prev.map((c) => (c.id === checkId ? { ...c, state } : c)));
      });
      setChecks(results);
      setFailedChecks(
        results
          .filter((check) => check.result === "fail")
          .map((check) => ({ id: check.id, name: check.name, ...(check.detail ? { detail: check.detail } : {}) }))
      );
      /* runChecks already marked the vault audited on the server, and a run
         always settles at AWAITING_APPROVAL, which is re-runnable */
      setVault((v) => (v ? { ...v, status: "audited" } : v));
      setDetail((d) => (d ? { ...d, rawStatus: "AWAITING_APPROVAL" } : d));
      const passed = results.filter((r) => r.result === "pass").length;
      const warned = results.filter((r) => r.result === "warn").length;
      const failed = results.filter((r) => r.result === "fail").length;
      const fallbackLine = `The audit is done. ${passed} of ${results.length} passed${
        warned ? `, ${warned} warning${warned === 1 ? "" : "s"}` : ""
      }${failed ? `, ${failed} failed` : ""}. ${results.map((r) => `${r.name}: ${r.detail}.`).join(" ")}`;
      const report = await getAuditReport(id);
      const line = report?.text || fallbackLine;
      const messageId = pushAi(line, report?.sources || [], report?.cached || false);
      streamInto(messageId, line);
      return results;
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
        setQuestionsUsed((n) => res.questionsUsed ?? n + 1);
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

  const approve = useCallback(async (waivers: WaiverRequest[] = []) => {
    if (busy) return;
    setBusy("approve");
    try {
      const next = await approveVault(id, waivers);
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

  const requestRevision = useCallback(async (note?: string) => {
    if (busy) return;
    setBusy("revision");
    try {
      const next = await requestRevisionApi(id, note);
      setVault(next);
      setRevisionNote(note?.trim() || null);
    } finally {
      setBusy("");
    }
  }, [busy, id]);

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
      approvedPending,
      checks,
      failedChecks,
      waivedChecks,
      revisionNote,
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
      requestRevision,
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
      approvedPending,
      checks,
      failedChecks,
      waivedChecks,
      revisionNote,
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
      requestRevision,
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
