/* ChecksPanel.tsx — the right column's upper half. One button runs the four
   checks in sequence; each card reports itself, and the card opens onto the
   rows behind the sentence (a status and a timing, a hex and a swatch, five
   test names). One polite line announces each finished check. */

import { useEffect, useRef, useState } from "react";
import { useToast } from "../shared/Toasts";
import { useRoom } from "./room";
import { Alert, Check, Chevron, Play, Spinner, X } from "./icons";

const DOT: Record<string, string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
  running: "RUNNING",
  queued: "QUEUED",
};

export function ChecksPanel() {
  const { checks, running, runAll, progress, status, detail } = useRoom();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const seen = useRef(new Set<string>());

  /* one line per finished check, into a single polite region */
  useEffect(() => {
    const finished = checks.filter((c) => c.state === "pass" || c.state === "warn" || c.state === "fail");
    const fresh = finished.filter((c) => !seen.current.has(c.id));
    if (!fresh.length) return;
    for (const c of fresh) seen.current.add(c.id);
    setAnnounce(`${fresh[fresh.length - 1].name}: ${DOT[fresh[fresh.length - 1].state]}. ${fresh[fresh.length - 1].detail}`);
  }, [checks]);

  const canRun = status === "held";
  const done = status === "audited" || status === "unlocked";

  const start = async () => {
    try {
      await runAll();
      const warned = (detail?.checks ?? []).filter((c) => c.result === "warn").length;
      const passed = (detail?.checks ?? []).filter((c) => c.result === "pass").length;
      toast({
        message: `Audit complete. ${passed} of ${detail?.checks.length ?? 0} passed${warned ? `, ${warned} warning` : ""}.`,
        tone: warned ? "info" : "success",
      });
    } catch (e) {
      toast({
        message: e instanceof Error ? e.message : "The checks did not finish.",
        tone: "error",
        action: { label: "Retry", run: () => void start() },
      });
    }
  };

  return (
    <section className="room-panel room-checks" aria-labelledby="room-checks-h" data-enter="checks">
      <header className="room-checks-head">
        <h2 id="room-checks-h" className="room-h">
          Checks
        </h2>
        <button
          type="button"
          className="room-run"
          onClick={() => void start()}
          disabled={!canRun || running}
          title={done ? "The audit is already complete." : canRun ? undefined : "Authorize the payment first."}
        >
          {running ? <Spinner className="room-run-spin" width="14" height="14" /> : <Play width="13" height="13" />}
          {running ? "Running…" : done ? "Re-run" : "Run all checks"}
        </button>
      </header>

      <div className="room-progress" role="progressbar" aria-valuemin={0} aria-valuemax={checks.length} aria-valuenow={Math.round(progress * checks.length)} aria-label="Checks finished">
        <span className="room-progress-fill" style={{ transform: `scaleX(${progress})` }} />
      </div>

      <p className="room-empty" data-idle={checks.every((c) => c.state === "queued") ? "true" : "false"} aria-hidden={checks.every((c) => c.state === "queued") ? undefined : true}>
        No checks run yet.
      </p>

      <ul className="room-check-list">
        {checks.map((c) => {
          const expanded = open === c.id;
          return (
            <li
              key={c.id}
              className="room-check"
              data-state={c.state}
              data-open={expanded ? "true" : undefined}
              data-flash={c.state === "pass" || c.state === "warn" ? "true" : undefined}
            >
              <button
                type="button"
                className="room-check-btn"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : c.id)}
              >
                <span className="room-check-state" aria-hidden="true">
                  {c.state === "pass" ? (
                    <Check width="13" height="13" />
                  ) : c.state === "warn" ? (
                    <Alert width="13" height="13" />
                  ) : c.state === "fail" ? (
                    <X width="13" height="13" />
                  ) : c.state === "running" ? (
                    <Spinner className="room-check-spin" width="13" height="13" />
                  ) : (
                    <span className="room-check-empty" />
                  )}
                </span>

                <span className="room-check-body">
                  <span className="room-check-name">{c.name}</span>
                  <span className="room-check-top">
                    <span className="room-check-detail">{c.detail}</span>
                    <span className="room-src" data-source={c.source}>
                      {c.source}
                    </span>
                  </span>
                </span>

                <Chevron className="room-check-chev" data-open={expanded ? "true" : undefined} width="13" height="13" />
              </button>

              {c.state === "running" && <span className="room-scan" aria-hidden="true" />}

              {expanded && (
                <div className="room-check-rows">
                  {c.rows.map((r) => (
                    <p key={r.label} className="room-check-row">
                      <span className="room-check-row-label">{r.label}</span>
                      <span className="room-check-row-value">
                        {c.swatch && /color/i.test(r.label) && (
                          <span className="room-swatch" style={{ background: c.swatch }} aria-hidden="true" />
                        )}
                        {r.value}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="dash-sr" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
