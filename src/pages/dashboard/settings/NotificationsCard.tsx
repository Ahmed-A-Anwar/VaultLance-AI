/* NotificationsCard.tsx — six events, two channels each, one exception: the
   weekly summary has no in-app digest, so its in-app switch is not rendered
   (hidden, not disabled: there is nothing there to turn on).

   "Mute all" is the visible domino: every switch gets a 0.0618s later start than
   the one above it, so the card reads as one gesture rather than eleven. */

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "../../../components/settings/SectionCard";
import { Switch } from "../../../components/settings/Switch";
import { DirtyFooter, type SaveState } from "../../../components/settings/DirtyFooter";
import { useToast } from "../../../components/shared/Toasts";
import { updateNotifications, type NotificationPrefs, type NotifKey } from "../../../lib/api";

const SPIN = 618;

const ROWS: Array<{ key: NotifKey; title: string; desc: string; emailOnly?: boolean }> = [
  { key: "payment_authorized", title: "Payment authorized", desc: "Funds are held for a new vault." },
  { key: "audit_completed", title: "Audit completed", desc: "The audit agent has a report for you." },
  { key: "payment_captured", title: "Payment captured", desc: "Approved funds move to the freelancer." },
  { key: "files_unlocked", title: "Files unlocked", desc: "A delivery opened after capture." },
  { key: "hold_voided", title: "Hold voided", desc: "A hold was released and nothing was charged." },
  { key: "weekly_summary", title: "Weekly summary", desc: "One email a week with your vault totals.", emailOnly: true },
];

const clone = (prefs: NotificationPrefs): NotificationPrefs =>
  Object.fromEntries(Object.entries(prefs).map(([k, v]) => [k, { ...v }])) as NotificationPrefs;

export function NotificationsCard({
  prefs,
  onSaved,
  onDirty,
  resetSignal,
}: {
  prefs: NotificationPrefs;
  onSaved: (next: NotificationPrefs) => void;
  onDirty: (dirty: boolean) => void;
  resetSignal: number;
}) {
  const push = useToast();
  const [draft, setDraft] = useState<NotificationPrefs>(() => clone(prefs));
  const [state, setState] = useState<SaveState>("idle");
  const [domino, setDomino] = useState(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(prefs), [draft, prefs]);

  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  useEffect(() => {
    setDraft(clone(prefs));
  }, [prefs, resetSignal]);

  useEffect(() => {
    if (state !== "saved") return;
    const id = window.setTimeout(() => setState("idle"), 1000);
    return () => window.clearTimeout(id);
  }, [state]);

  const allOff = ROWS.every(
    (row) => !draft[row.key].email && (row.emailOnly || !draft[row.key].inapp)
  );

  const toggleAll = () => {
    const next = clone(draft);
    for (const row of ROWS) {
      next[row.key].email = allOff;
      if (!row.emailOnly) next[row.key].inapp = allOff;
    }
    setDraft(next);
    setDomino(true);
    window.setTimeout(() => setDomino(false), 1000);
  };

  const save = async () => {
    setState("saving");
    try {
      const [next] = await Promise.all([
        updateNotifications(draft),
        new Promise<void>((res) => window.setTimeout(res, SPIN)),
      ]);
      setState("saved");
      push({ message: "Notifications saved.", tone: "success" });
      onSaved(next);
    } catch (e) {
      setState("idle");
      push({ message: e instanceof Error ? e.message : "Couldn't save. Try again.", tone: "error" });
    }
  };

  return (
    <SectionCard
      id="notifications"
      title="Notifications"
      caption="CHOOSE HOW WE REACH YOU"
      action={
        <button type="button" className="dash-btn dash-btn-ghost set-mute" onClick={toggleAll} data-testid="notif-mute">
          <span className="dash-btn-label">{allOff ? "Unmute all" : "Mute all"}</span>
        </button>
      }
      footer={
        <DirtyFooter
          show={dirty}
          state={state}
          onDiscard={() => setDraft(clone(prefs))}
          onSave={save}
          testId="notif-save"
        />
      }
    >
      <div className="set-notif-head" aria-hidden="true">
        <span />
        <span className="set-notif-col">Email</span>
        <span className="set-notif-col">In-app</span>
      </div>

      <ul className="set-notif-list">
        {ROWS.map((row, i) => (
          <li className="set-notif-row" key={row.key} data-testid={`notif-row-${row.key}`}>
            <div className="set-notif-copy">
              <p className="set-notif-title">{row.title}</p>
              <p className="set-notif-desc">{row.desc}</p>
            </div>
            <div className="set-notif-switch">
              <Switch
                checked={draft[row.key].email}
                onChange={(next) =>
                  setDraft((prev) => ({ ...prev, [row.key]: { ...prev[row.key], email: next } }))
                }
                label={`${row.title}, email`}
                delay={domino ? i * 2 * 0.0618 : 0}
                testId={`notif-${row.key}-email`}
              />
            </div>
            <div className="set-notif-switch">
              {row.emailOnly ? (
                <span className="set-notif-none" aria-hidden="true">
                  —
                </span>
              ) : (
                <Switch
                  checked={draft[row.key].inapp}
                  onChange={(next) =>
                    setDraft((prev) => ({ ...prev, [row.key]: { ...prev[row.key], inapp: next } }))
                  }
                  label={`${row.title}, in-app`}
                  delay={domino ? (i * 2 + 1) * 0.0618 : 0}
                  testId={`notif-${row.key}-inapp`}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
