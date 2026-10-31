/* PreferencesCard.tsx — motion and the keyboard map.

   Motion previews instantly: choosing "Reduced" writes data-motion on <html> the
   moment it is chosen, and Discard puts the saved value back. The commit only
   decides what survives the tab.

   The shortcut list is read-only reference: the keys belong to the audit room and
   are listed here so a client can find them. */

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "../../../components/settings/SectionCard";
import { Segmented } from "../../../components/settings/Segmented";
import { DirtyFooter, type SaveState } from "../../../components/settings/DirtyFooter";
import { useToast } from "../../../components/shared/Toasts";
import { updatePreferences, type MotionPref } from "../../../lib/api";

const SPIN = 618;

const OPTIONS: ReadonlyArray<{ value: MotionPref; label: string }> = [
  { value: "system", label: "System" },
  { value: "reduce", label: "Reduced" },
  { value: "full", label: "Full" },
];

const SHORTCUTS: Array<{ keys: string[]; what: string }> = [
  { keys: ["/"], what: "Focus the audit chat composer" },
  { keys: ["Space"], what: "Hold to approve a vault" },
  { keys: ["Esc"], what: "Close a dialog" },
];

export function PreferencesCard({
  motion,
  onSaved,
  onDirty,
  resetSignal,
  onPreview,
}: {
  motion: MotionPref;
  onSaved: (next: MotionPref) => void;
  onDirty: (dirty: boolean) => void;
  resetSignal: number;
  onPreview: (next: MotionPref) => void;
}) {
  const push = useToast();
  const [draft, setDraft] = useState<MotionPref>(motion);
  const [state, setState] = useState<SaveState>("idle");

  const dirty = draft !== motion;
  const saved = useMemo(() => motion, [motion]);

  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  useEffect(() => {
    setDraft(saved);
  }, [saved, resetSignal]);

  useEffect(() => {
    if (state !== "saved") return;
    const id = window.setTimeout(() => setState("idle"), 1000);
    return () => window.clearTimeout(id);
  }, [state]);

  const pick = (next: MotionPref) => {
    setDraft(next);
    onPreview(next);
  };

  const save = async () => {
    setState("saving");
    try {
      const [result] = await Promise.all([
        updatePreferences({ motion: draft }),
        new Promise<void>((res) => window.setTimeout(res, SPIN)),
      ]);
      setState("saved");
      push({ message: "Preferences saved.", tone: "success" });
      onSaved(result.motion);
    } catch (e) {
      setState("idle");
      push({ message: e instanceof Error ? e.message : "Couldn't save. Try again.", tone: "error" });
    }
  };

  return (
    <SectionCard
      id="preferences"
      title="Preferences"
      caption="MOTION AND KEYBOARD"
      footer={
        <DirtyFooter
          show={dirty}
          state={state}
          onDiscard={() => {
            setDraft(motion);
            onPreview(motion);
          }}
          onSave={save}
          testId="pref-save"
        />
      }
    >
      <div className="set-fields">
        <div className="set-field">
          <span className="set-label" id="motion-label">
            Motion
          </span>
          <Segmented
            name="motion"
            label="Motion"
            value={draft}
            options={OPTIONS}
            onChange={pick}
          />
          <p className="set-hint" aria-live="polite">
            {draft === "reduce"
              ? "Animation is off. Screens change instantly."
              : draft === "full"
                ? "Animation is on, whatever your system prefers."
                : "Follows your system's reduced-motion setting."}
          </p>
        </div>

        <div className="set-field">
          <span className="set-label">Shortcuts</span>
          <ul className="set-keys">
            {SHORTCUTS.map((row) => (
              <li className="set-key-row" key={row.what}>
                <span className="set-keycaps">
                  {row.keys.map((key) => (
                    <kbd className="set-kbd" key={key}>
                      {key}
                    </kbd>
                  ))}
                </span>
                <span className="set-key-what">{row.what}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
