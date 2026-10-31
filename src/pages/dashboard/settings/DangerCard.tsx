/* DangerCard.tsx — export, and the only irreversible action in the product.

   Delete opens a sheet that first asks the account a question it can answer: are
   any vaults still held or audited? If yes, there is no delete control at all,
   just the list of vaults standing in the way. If no, the email has to be typed
   exactly and the button has to be held for 1.618s — the shared HoldButton, in a
   danger ring.

   The card's border pulses once, the first time it is seen. It never loops. */

import { useEffect, useRef, useState } from "react";
import { SectionCard } from "../../../components/settings/SectionCard";
import { Field } from "../../../components/settings/Field";
import { Modal } from "../../../components/settings/Modal";
import { HoldButton } from "../../../components/shared/HoldButton";
import { useToast } from "../../../components/shared/Toasts";
import { deleteAccount, exportData, listDeleteBlockers, type Vault } from "../../../lib/api";

export function DangerCard({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const push = useToast();
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [blockers, setBlockers] = useState<Vault[] | null>(null);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [dim, setDim] = useState(false);
  const [pulsed, setPulsed] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  /* one pulse, the first time the card is in view */
  useEffect(() => {
    const el = root.current;
    if (!el || pulsed) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPulsed(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pulsed]);

  const run = async () => {
    setExporting(true);
    try {
      const blob = await exportData();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "vaultlance-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      push({ message: "Export ready.", tone: "success" });
    } catch (e) {
      push({ message: e instanceof Error ? e.message : "Couldn't build the export.", tone: "error" });
    } finally {
      setExporting(false);
    }
  };

  const openDelete = async () => {
    setOpen(true);
    setTyped("");
    setBlockers(null);
    setChecking(true);
    try {
      setBlockers(await listDeleteBlockers());
    } catch (e) {
      push({ message: e instanceof Error ? e.message : "Couldn't check your vaults.", tone: "error" });
      setOpen(false);
    } finally {
      setChecking(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount(typed);
      setDim(true);
      push({ message: "Account deleted.", tone: "info" });
      window.setTimeout(() => {
        setOpen(false);
        onDeleted();
      }, 1000);
    } catch (e) {
      push({ message: e instanceof Error ? e.message : "Couldn't delete the account.", tone: "error" });
      setDeleting(false);
    }
  };

  const blocked = !!blockers && blockers.length > 0;
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <div ref={root} className={`set-danger-wrap${dim ? " is-dim" : ""}`}>
      <SectionCard
        id="danger"
        title="Danger zone"
        caption="THESE ACTIONS CAN'T BE UNDONE EASILY"
        tone="danger"
        className={`set-danger${pulsed ? " is-pulsed" : ""}`}
      >
        <div className="set-danger-row">
          <div className="set-danger-copy">
            <p className="set-danger-h">Export my data</p>
            <p className="set-block-sub">Profile, vaults and every ledger event, as one JSON file.</p>
          </div>
          <button
            type="button"
            className="dash-btn dash-btn-ghost set-btn-55"
            onClick={run}
            disabled={exporting}
            data-testid="export-data"
          >
            {exporting && <span className="dash-spin" aria-hidden="true" />}
            <span className="dash-btn-label">{exporting ? "Preparing…" : "Export data"}</span>
          </button>
        </div>

        <div className="set-danger-row">
          <div className="set-danger-copy">
            <p className="set-danger-h">Delete account</p>
            <p className="set-block-sub">Removes your account and your vault history.</p>
          </div>
          <button
            type="button"
            className="dash-btn set-danger-btn set-btn-55"
            onClick={() => void openDelete()}
            data-testid="delete-open"
          >
            <span className="dash-btn-label">Delete account</span>
          </button>
        </div>
      </SectionCard>

      <Modal open={open} title="Delete account" onClose={() => !deleting && setOpen(false)} tone="danger" testId="delete-modal">
        {checking && <p className="set-block-sub">Checking your vaults…</p>}

        {blocked && blockers && (
          <div className="set-blocked">
            <p className="set-blocked-h">Resolve these vaults first.</p>
            <p className="set-block-sub">Your held funds must be approved or voided.</p>
            <ul className="set-blocked-list">
              {blockers.map((vault) => (
                <li key={vault.id}>
                  <a className="set-blocked-link" href={`/vault/${vault.id}`}>
                    {vault.project}
                    <span className="set-blocked-meta">
                      {vault.status.toUpperCase()} · ${vault.amountUSD.toLocaleString("en-US")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!checking && blockers && !blocked && (
          <div className="set-delete">
            <p className="set-block-sub">
              This permanently deletes your account and your vault history. Type <b>{email}</b> to continue.
            </p>
            <Field
              id="delete-email"
              label="Your email"
              type="email"
              value={typed}
              onChange={setTyped}
              autoComplete="off"
              inputMode="email"
              testId="delete-email"
            />
            <div className="set-delete-hold">
              <HoldButton
                label="Hold to delete"
                pendingLabel="Deleting…"
                pending={deleting}
                disabled={!matches || deleting}
                className="set-hold-danger"
                onConfirm={confirmDelete}
              />
            </div>
            <p className="set-hint">Hold for 1.618s. Releasing early does nothing.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
