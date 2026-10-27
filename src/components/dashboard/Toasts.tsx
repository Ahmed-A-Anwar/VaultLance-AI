/* Toasts.tsx — one toast system for the dashboard: bottom right, 13px from the
   edges, at most three stacked, five seconds each, paused while the pointer is
   over them. Errors can carry a Retry action. */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: { label: string; run: () => void };
}

interface Toast extends ToastInput {
  id: number;
  tone: ToastTone;
}

type PushToast = (toast: ToastInput) => void;

const ToastContext = createContext<PushToast>(() => {});

const MAX = 3;
const LIFE = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, number>());
  const nextId = useRef(1);

  const drop = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const arm = useCallback(
    (id: number) => {
      const timer = window.setTimeout(() => drop(id), LIFE);
      timers.current.set(id, timer);
    },
    [drop]
  );

  const push = useCallback<PushToast>(
    (input) => {
      const id = nextId.current++;
      const toast: Toast = { id, tone: input.tone ?? "info", ...input };
      setToasts((prev) => [...prev, toast].slice(-MAX));
      arm(id);
    },
    [arm]
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="dash-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="dash-toast"
            data-tone={t.tone}
            onMouseEnter={() => {
              const timer = timers.current.get(t.id);
              if (timer) window.clearTimeout(timer);
              timers.current.delete(t.id);
            }}
            onMouseLeave={() => arm(t.id)}
          >
            <span className="dash-toast-mark" aria-hidden="true" />
            <p className="dash-toast-text">{t.message}</p>
            {t.action && (
              <button
                type="button"
                className="dash-toast-action"
                onClick={() => {
                  t.action?.run();
                  drop(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="dash-toast-close" aria-label="Dismiss" onClick={() => drop(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
