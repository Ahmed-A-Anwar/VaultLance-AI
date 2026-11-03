/* focusTrap.ts — a dialog keeps the keyboard. Tab and Shift+Tab cycle inside
   the panel, Escape asks the panel to close, and when the panel unmounts focus
   goes back to whatever opened it.

   Deliberately small: no dependency, no inert polyfill. */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface TrapHandle {
  release: () => void;
}

export function trapFocus(root: HTMLElement, onEscape?: () => void): TrapHandle {
  const opener = document.activeElement as HTMLElement | null;

  const items = () =>
    Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );

  /* land on the panel's first real control, not the panel itself */
  const first = items()[0];
  (first ?? root).focus();

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onEscape?.();
      return;
    }
    if (e.key !== "Tab") return;

    const list = items();
    if (list.length === 0) {
      e.preventDefault();
      return;
    }
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && (index <= 0 || index === -1)) {
      e.preventDefault();
      list[list.length - 1].focus();
    } else if (!e.shiftKey && index === list.length - 1) {
      e.preventDefault();
      list[0].focus();
    }
  };

  document.addEventListener("keydown", onKey, true);

  return {
    release: () => {
      document.removeEventListener("keydown", onKey, true);
      if (opener && document.body.contains(opener)) opener.focus();
    },
  };
}
