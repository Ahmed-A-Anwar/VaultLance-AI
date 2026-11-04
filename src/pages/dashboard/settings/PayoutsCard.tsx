/* PayoutsCard.tsx — the freelancer's money mechanics: the currency money lands
   in, the beat the payouts arrive on, what happens after a failed payout, and
   the one notification row that belongs here as much as to the notifications
   card (it edits the same payout_sent preference both cards read).

   Mock only: everything under this card names the endpoint it will call once
   this is not a sandbox. */

import { useEffect, useState } from "react";
import { SectionCard } from "../../../components/settings/SectionCard";
import { Switch } from "../../../components/settings/Switch";
import { Segmented } from "../../../components/settings/Segmented";
import { DirtyFooter, type SaveState } from "../../../components/settings/DirtyFooter";
import { useToast } from "../../../components/shared/Toasts";
import {
  updateNotifications,
  updatePayoutPrefs,
  type NotificationPrefs,
  type PayoutRetryMode,
} from "../../../lib/api";
import { formatCents, MIN_AMOUNT_CENTS } from "../../../lib/fees";

const SPIN = 618;

export function PayoutsCard({
  retryMode,
  payoutNotify,
  notifications,
  onSaved,
  onDirty,
  resetSignal,
}: {
  retryMode: PayoutRetryMode;
  /* the payout_sent preference, email channel; the switch moves both */
  payoutNotify: boolean;
  /* the saved notifications, so the shared preference is written whole */
  notifications: NotificationPrefs;
  onSaved: (next: { retry: PayoutRetryMode; notifications: NotificationPrefs }) => void;
  onDirty: (dirty: boolean) => void;
  resetSignal: number;
}) {
  const push = useToast();
  const [retry, setRetry] = useState<PayoutRetryMode>(retryMode);
  const [notify, setNotify] = useState(payoutNotify);
  const [state, setState] = useState<SaveState>("idle");

  const dirty = retry !== retryMode || notify !== payoutNotify;

  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  useEffect(() => {
    setRetry(retryMode);
    setNotify(payoutNotify);
  }, [retryMode, payoutNotify, resetSignal]);

  useEffect(() => {
    if (state !== "saved") return;
    const id = window.setTimeout(() => setState("idle"), 1000);
    return () => window.clearTimeout(id);
  }, [state]);

  const save = async () => {
    setState("saving");
    try {
      const nextNotifications: NotificationPrefs = {
        ...notifications,
        payout_sent: { ...notifications.payout_sent, email: notify, inapp: notify },
      };
      await Promise.all([
        updatePayoutPrefs({ retry }),
        updateNotifications(nextNotifications),
        new Promise<void>((res) => window.setTimeout(res, SPIN)),
      ]);
      setState("saved");
      push({ message: "Payout settings saved.", tone: "success" });
      onSaved({ retry, notifications: nextNotifications });
    } catch (e) {
      setState("idle");
      push({ message: e instanceof Error ? e.message : "Couldn't save. Try again.", tone: "error" });
    }
  };

  return (
    <SectionCard
      id="payouts"
      title="Payouts"
      caption="WHERE THE MONEY LANDS"
      footer={
        <DirtyFooter
          show={dirty}
          state={state}
          onDiscard={() => {
            setRetry(retryMode);
            setNotify(payoutNotify);
          }}
          onSave={save}
          testId="payouts-save"
        />
      }
    >
      <div className="set-field">
        <span className="set-label">Currency</span>
        <div className="set-readonly-row">
          <span className="dash-chip set-chip-client">USD</span>
          <span className="set-hint">Payouts land in US dollars. Sandbox only: no real money moves.</span>
        </div>
      </div>

      <div className="set-field">
        <span className="set-label">Payout speed</span>
        <p className="set-block-sub">
          Payouts are sent right after your client's approval clears.
        </p>
      </div>

      <div className="set-field">
        <span className="set-label">Failed payout behavior</span>
        <Segmented
          label="Failed payout behavior"
          name="payout-retry"
          value={retry}
          options={[
            { value: "retry_auto", label: "Retry automatically" },
            { value: "ask_first", label: "Ask me first" },
          ]}
          onChange={setRetry}
        />
      </div>

      <div className="set-field">
        <span className="set-label">Notify me when a payout is sent</span>
        <div className="set-readonly-row">
          <Switch
            checked={notify}
            onChange={setNotify}
            label="Notify me when a payout is sent"
            testId="payouts-notify"
          />
          <span className="set-hint">The same switch the notifications card shows as “Payout sent”.</span>
        </div>
      </div>

      <p className="set-hint">{formatCents(MIN_AMOUNT_CENTS)} minimum per vault.</p>
    </SectionCard>
  );
}
