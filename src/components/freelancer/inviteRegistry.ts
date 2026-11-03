/* inviteRegistry.ts — the codes a vault hands to its client, and the lookup the
   client's "Join a vault" row uses. Its own module so api.ts can read it without
   importing the freelancer mock, and so the freelancer mock can register into it
   without a cycle.

   Module memory only: a reload forgets every code except the seeded one, which
   is exactly what a mock should do. */

export interface InviteEntry {
  code: string;
  project: string;
  freelancer: string;
  amountCents: number;
  clientEmail: string;
  vaultId: string;
}

const codes = new Map<string, InviteEntry>();

/** The four-and-four shape the spec fixed, minus look-alike characters. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newInviteCode(): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  return `VL-${pick(4)}-${pick(4)}`;
}

export function registerInvite(entry: InviteEntry): InviteEntry {
  codes.set(entry.code.toUpperCase(), { ...entry, code: entry.code.toUpperCase() });
  return entry;
}

export function lookupInvite(code: string): InviteEntry | null {
  return codes.get(code.trim().toUpperCase()) ?? null;
}

export function forgetInvite(code: string): void {
  codes.delete(code.trim().toUpperCase());
}

/* seeded so "Join a vault" works on a fresh tab, before the freelancer page has
   ever been opened: this is the Landing Page vault from Maya's list */
registerInvite({
  code: "VL-7K2Q-9XMD",
  project: "Landing Page",
  freelancer: "Maya",
  amountCents: 30_000,
  clientEmail: "ahmed@example.com",
  vaultId: "fv_landing",
});
