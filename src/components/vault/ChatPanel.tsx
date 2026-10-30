/* ChatPanel.tsx — the centre column, where the audit is explained. The agent's
   words stream at forty characters a second, every answer carries the checks it
   read, and the composer knows the demo's question budget. Before the hold is
   authorized the whole conversation sits behind a glass padlock. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoom } from "./room";
import { useToast } from "../shared/Toasts";
import { Bolt, Check, Copy, Lock, LockOpen, Send } from "./icons";

const SOURCE_NOTE: Record<string, string> = {
  "TEST LOG": "Read from the delivered test-log.xml",
  "BROWSER TEST": "Playwright ran the staging build in a browser",
  "PIXEL SCAN": "Sampled the delivered pixels and their alpha",
  "HTTP PROBE": "Called the staging endpoint directly",
  "DEMO CACHE": "A cached demo answer, not a live model",
};

export function ChatPanel() {
  const { detail, status, messages, asking, ask, retry, questionsUsed, questionLimit } = useRoom();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [fresh, setFresh] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const idle = useRef(0);

  const locked = status === "awaiting_payment";
  /* once the money has moved the conversation is a record, not a tool */
  const closed = status === "unlocked" || status === "voided";
  const atLimit = questionsUsed >= questionLimit;
  const suggestions = detail?.suggestions ?? [];

  /* follow the stream, unless the reader has gone back up the log */
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    if (atBottom) el.scrollTo({ top: el.scrollHeight, behavior: asking ? "auto" : "smooth" });
    else setFresh(true);
  }, [messages, atBottom, asking]);

  const onScroll = useCallback(() => {
    const el = log.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 42;
    setAtBottom(near);
    if (near) setFresh(false);
  }, []);

  /* "/" reaches the composer from anywhere in the room */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* suggestions fade after the first question and come back when it goes quiet */
  useEffect(() => {
    if (!messages.some((m) => m.role === "user")) {
      setShowSuggestions(true);
      return;
    }
    setShowSuggestions(false);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      if (!asking) setShowSuggestions(true);
    }, 30_000);
    return () => window.clearTimeout(idle.current);
  }, [messages, asking]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || asking || locked || closed || atLimit) return;
    setDraft("");
    setAtBottom(true);
    void ask(value);
  };

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1000);
    } catch {
      toast({ message: "Could not copy the answer.", tone: "error" });
    }
  };

  return (
    <section className="room-panel room-chat" aria-labelledby="room-chat-h" data-enter="chat" data-locked={locked ? "true" : undefined}>
      <header className="room-chat-head">
        <h2 id="room-chat-h" className="room-h">
          Ask the audit agent
        </h2>
        <span className="room-mono">
          {questionsUsed} OF {questionLimit} QUESTIONS
        </span>
      </header>

      <div className="room-log-wrap">
        <div
          className="room-log"
          role="log"
          aria-live="polite"
          aria-label="Audit conversation"
          ref={log}
          onScroll={onScroll}
        >
          {messages.map((m) => (
            <div key={m.id} className="room-msg" data-role={m.role}>
              {m.role === "ai" && (
                <span className="room-avatar" aria-hidden="true">
                  <Bolt width="13" height="13" />
                </span>
              )}

              <div className="room-bubble" data-failed={m.failed ? "true" : undefined}>
                {m.typing ? (
                  <span className="room-typing" aria-label="The agent is typing">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <p className="room-bubble-text">
                    {m.text}
                    {m.streaming && <span className="room-caret" aria-hidden="true" />}
                  </p>
                )}

                {m.failed && m.question && (
                  <button type="button" className="room-retry" onClick={() => void retry(m.id)}>
                    Try again
                  </button>
                )}

                {!m.typing && !m.streaming && m.sources.length > 0 && (
                  <div className="room-sources">
                    {m.sources.map((s, i) => (
                      <span
                        key={s}
                        className="room-src"
                        data-source={s}
                        title={SOURCE_NOTE[s]}
                        style={{ animationDelay: `${i * 100}ms` }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {m.role === "ai" && !m.typing && (
                <button
                  type="button"
                  className="room-copy"
                  aria-label={copied === m.id ? "Copied" : "Copy answer"}
                  onClick={() => void copy(m.id, m.text)}
                >
                  {copied === m.id ? <Check width="14" height="14" /> : <Copy width="14" height="14" />}
                </button>
              )}
            </div>
          ))}
        </div>

        {!atBottom && fresh && (
          <button
            type="button"
            className="room-new"
            onClick={() => {
              const el = log.current;
              el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
              setFresh(false);
            }}
          >
            New message
          </button>
        )}

        {locked && (
          <div className="room-lock-overlay" aria-live="polite">
            <span className="room-lock-badge" aria-hidden="true">
              {status === "awaiting_payment" ? <Lock width="21" height="21" /> : <LockOpen width="21" height="21" />}
            </span>
            <p className="room-lock-text">Authorize payment to start the audit.</p>
            <p className="room-mono">NOTHING IS CHARGED YET</p>
          </div>
        )}
      </div>

      {showSuggestions && !locked && !closed && suggestions.length > 0 && (
        <div className="room-suggest" aria-label="Suggested questions">
          {suggestions.map((q) => (
            <button key={q} type="button" className="room-suggest-chip" onClick={() => send(q)} disabled={asking || atLimit}>
              {q}
            </button>
          ))}
        </div>
      )}

      {atLimit && !closed && <p className="room-hint room-limit">Question limit reached for this demo.</p>}

      {closed ? (
        <p className="room-closed room-mono">AUDIT CLOSED</p>
      ) : (
        <form
          className="room-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <textarea
            ref={input}
            className="room-input"
            rows={1}
            value={draft}
            placeholder={atLimit ? "Question limit reached for this demo." : "Ask about this delivery…"}
            aria-label="Ask the audit agent"
            disabled={atLimit || locked}
            onChange={(e) => {
              setDraft(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 89)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          <button
            type="submit"
            className="room-send"
            aria-label="Send question"
            disabled={asking || atLimit || locked || !draft.trim()}
          >
            {asking ? <span className="dash-spin" aria-hidden="true" /> : <Send width="18" height="18" />}
          </button>
        </form>
      )}

      <p className="room-note room-mono">DEMO DATA · REAL CHECKS IN THE FULL BUILD</p>
    </section>
  );
}
