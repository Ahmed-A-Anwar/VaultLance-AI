import type { VaultStatus } from "../shared/types.js";
import { InvalidStateTransitionError } from "../shared/errors.js";

/**
 * Strict Allowed State Transitions Map for Vault Lifecycle
 */
export const ALLOWED_TRANSITIONS: Record<VaultStatus, VaultStatus[]> = {
  DRAFT: ["AWAITING_CLIENT", "CANCELLED"],
  AWAITING_CLIENT: ["AWAITING_AUTHORIZATION", "CANCELLED"],
  AWAITING_AUTHORIZATION: ["AUTHORIZED", "CANCELLED", "EXPIRED"],
  AUTHORIZED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["SUBMITTED", "DISPUTED"],
  SUBMITTED: ["VERIFYING", "DISPUTED"],
  VERIFYING: ["AWAITING_APPROVAL", "NEEDS_REVISION", "DISPUTED"],
  NEEDS_REVISION: ["SUBMITTED", "CANCELLED", "DISPUTED"],
  AWAITING_APPROVAL: ["CAPTURE_PENDING", "NEEDS_REVISION", "DISPUTED"],
  CAPTURE_PENDING: ["PAID", "DISPUTED"],
  PAID: [], // Terminal state
  CANCELLED: [], // Terminal state
  EXPIRED: [], // Terminal state
  DISPUTED: ["PAID", "CANCELLED"],
};

export class VaultStateMachine {
  public static isTransitionAllowed(from: VaultStatus, to: VaultStatus): boolean {
    const allowed = ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  public static assertTransition(from: VaultStatus, to: VaultStatus, reason?: string): void {
    if (!this.isTransitionAllowed(from, to)) {
      throw new InvalidStateTransitionError(
        from,
        to,
        reason || `Allowed transitions from '${from}' are: [${(ALLOWED_TRANSITIONS[from] || []).join(", ")}]`
      );
    }
  }

  public static isTerminal(status: VaultStatus): boolean {
    return (ALLOWED_TRANSITIONS[status] || []).length === 0;
  }
}
