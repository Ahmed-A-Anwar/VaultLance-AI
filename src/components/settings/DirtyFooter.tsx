/* DirtyFooter.tsx — the strip a card grows when its draft stops matching what is
   saved: Discard on the left, the brass save on the right, and the save's three
   states (idle, spinning, checked). It slides up 21px on the way in and out.

   Hidden means hidden: visibility keeps it out of the tab order while a card is
   clean, so a keyboard walk never lands on a button that does nothing. */

export type SaveState = "idle" | "saving" | "saved";

export interface DirtyFooterProps {
  show: boolean;
  state: SaveState;
  disabled?: boolean;
  onDiscard: () => void;
  onSave: () => void;
  label?: string;
  /* one footer per card: the test handle has to say which card */
  testId: string;
}

export function DirtyFooter({
  show,
  state,
  disabled = false,
  onDiscard,
  onSave,
  label = "Save changes",
  testId,
}: DirtyFooterProps) {
  const shown = show || state !== "idle";

  return (
    <div className="set-dirty" data-show={shown ? "1" : "0"} aria-hidden={!shown}>
      <button
        type="button"
        className="dash-btn dash-btn-ghost set-discard"
        onClick={onDiscard}
        tabIndex={shown ? undefined : -1}
      >
        <span className="dash-btn-label">Discard</span>
      </button>
      <button
        type="button"
        className="dash-btn dash-btn-primary set-save"
        onClick={onSave}
        disabled={disabled || state === "saving"}
        tabIndex={shown ? undefined : -1}
        data-testid={testId}
      >
        {state === "saving" && <span className="dash-spin" aria-hidden="true" />}
        {state === "saved" && (
          <svg
            className="set-saved-check"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path className="set-draw" d="M4 13l5 5L20 6" />
          </svg>
        )}
        {state === "idle" && (
          <svg
            className="set-save-icon dash-btn-arrow"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.4 8h11M9.4 4l4 4-4 4" />
          </svg>
        )}
        <span className="dash-btn-label">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : label}
        </span>
      </button>
    </div>
  );
}
