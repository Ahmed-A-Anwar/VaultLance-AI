/* DevPanel.tsx — Shift+D opens a small panel for firing events by hand during
   a demo. Development builds only: production returns nothing at all. */

import { useEffect, useState } from "react";
import { devVaultIds, simulateWebhook, type LedgerType } from "../../lib/api";

/* vite's env without pulling in its client types */
const isDev = () =>
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

const TYPES: LedgerType[] = [
  "PAYMENT.AUTHORIZED",
  "AUDIT.COMPLETED",
  "PAYMENT.CAPTURED",
  "FILES.UNLOCKED",
  "PAYMENT.VOIDED",
];

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [vaultId, setVaultId] = useState("");
  const vaults = devVaultIds();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.key.toLowerCase() !== "d") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!isDev() || !open) return null;

  const target = vaultId || vaults[0]?.id || "";

  return (
    <aside className="dash-dev" aria-label="Developer panel">
      <p className="dash-eyebrow">
        <span className="dash-eyebrow-mark" aria-hidden="true" />
        WEBHOOKS
      </p>
      <label className="dash-dev-label">
        Vault
        <select className="dash-dev-select" value={target} onChange={(e) => setVaultId(e.target.value)}>
          {vaults.map((v) => (
            <option key={v.id} value={v.id}>
              {v.project}
            </option>
          ))}
        </select>
      </label>
      <div className="dash-dev-buttons">
        {TYPES.map((type) => (
          <button key={type} type="button" className="dash-dev-btn" onClick={() => simulateWebhook(target, type)}>
            {type}
          </button>
        ))}
      </div>
      <p className="dash-mono dim">Shift+D closes this.</p>
    </aside>
  );
}
