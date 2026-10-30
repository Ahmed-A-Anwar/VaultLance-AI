/* StatusChip.tsx — the one status chip: mono 12px, 0.14em tracking, one hue per
   state, always a word and never a colour alone. The dashboard's vault cards and
   the audit room's top bar and decision panel all render this. */

import type { VaultStatus } from "../../lib/api";

const LABEL: Record<VaultStatus, string> = {
  awaiting_payment: "AWAITING PAYMENT",
  held: "HELD",
  audited: "AUDITED",
  unlocked: "UNLOCKED",
  voided: "VOIDED",
};

export function StatusChip({ status, className }: { status: VaultStatus; className?: string }) {
  return (
    <span className={`dash-chip${className ? ` ${className}` : ""}`} data-status={status}>
      {LABEL[status]}
    </span>
  );
}
