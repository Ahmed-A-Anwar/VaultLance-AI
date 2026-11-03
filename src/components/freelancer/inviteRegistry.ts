/* inviteRegistry.ts — the codes this browser has minted, and what each one
   stands for. Module memory is the source of truth; sessionStorage keeps the
   list across a reload so the client side can still redeem a code it was given
   before the tab refreshed.

   A real deployment would do this server-side (POST /api/vaults/{id}/invite
   stores the code and the join endpoint looks it up). Here the registry is the
   server, and api.ts's joinVault reads it through the function below. */

import { INVITE_CODE_ALPHABET } from "./mockConfig";

export interface InviteRecord {
  code: string;
  vaultId: string;
  project: string;
  clientEmail: string;
  amountCents: number;
  createdAt: number;
}

const STORAGE_KEY = "vl.fd.invites";

const registry = new Map<string, InviteRecord>();

function persist(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...registry.values()]));
  } catch {
    /* private mode, or a full quota: memory still answers in this tab */
  }
}

function hydrate(): void {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const rows = JSON.parse(raw) as InviteRecord[];
    for (const row of rows) {
      if (row && typeof row.code === "string" && !registry.has(row.code)) {
        registry.set(row.code, row);
      }
    }
  } catch {
    /* a corrupt entry is not worth a broken dashboard */
  }
}

hydrate();

/** VL-XXXX-XXXX from the safe alphabet. */
export function mintInviteCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () => INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)]).join("");
  return `VL-${block()}-${block()}`;
}

export function registerInvite(record: Omit<InviteRecord, "code"> & { code?: string }): InviteRecord {
  let code = record.code?.toUpperCase();
  if (!code) {
    do {
      code = mintInviteCode();
    } while (registry.has(code));
  }
  const stored: InviteRecord = { ...record, code };
  registry.set(code, stored);
  persist();
  return stored;
}

export function lookupInvite(code: string): InviteRecord | null {
  return registry.get(code.trim().toUpperCase()) ?? null;
}

/** Test and dev helper: forget every code minted in this browser. */
export function resetInvites(): void {
  registry.clear();
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export const inviteCodes = (): string[] => [...registry.keys()];
