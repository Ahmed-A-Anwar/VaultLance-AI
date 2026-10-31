/* UnsavedDialog.tsx — the one thing standing between a half-typed form and the
   rail. Section changes never open it; leaving the page does. */

import { Modal } from "../../../components/settings/Modal";

export function UnsavedDialog({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <Modal open={open} title="Discard unsaved changes?" onClose={onKeep} testId="unsaved-modal">
      <p className="set-block-sub">
        One of your sections has a change that has not been saved yet. Leaving now loses it.
      </p>
      <div className="set-modal-actions">
        <button type="button" className="dash-btn dash-btn-primary set-btn-55" onClick={onKeep} data-testid="keep-editing">
          <span className="dash-btn-label">Keep editing</span>
        </button>
        <button type="button" className="dash-btn set-danger-btn set-btn-55" onClick={onDiscard} data-testid="discard-leave">
          <span className="dash-btn-label">Discard</span>
        </button>
      </div>
    </Modal>
  );
}
