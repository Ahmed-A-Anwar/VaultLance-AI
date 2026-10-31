/* Modal.tsx — the one dialog the settings page opens. Portalled to <body> because
   every settings card carries a backdrop-filter, and a filtered ancestor becomes
   the containing block for position: fixed.

   Focus goes in on open, cycles inside while it is open, and returns to whatever
   opened it on close. Escape closes. On a phone the panel is a bottom sheet; the
   CSS decides that, the component only owns the contract. */

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  tone?: "default" | "danger";
  testId?: string;
}

export function Modal({ open, title, onClose, children, tone = "default", testId }: ModalProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const restore = useRef<HTMLElement | null>(null);

  /* remember the opener before the panel takes focus */
  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    document.body.classList.add("set-locked");
    return () => {
      document.body.classList.remove("set-locked");
      restore.current?.focus();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (!nodes.length) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    },
    [onClose]
  );

  if (!open) return null;

  return createPortal(
    <div
      className="set-scrim"
      data-tone={tone}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className="set-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-tone={tone}
        data-testid={testId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="set-modal-head">
          <h2 className="set-modal-h">{title}</h2>
          <button type="button" className="set-modal-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="set-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
