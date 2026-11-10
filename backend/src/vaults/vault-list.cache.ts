import type { VaultDTO } from "./vault.types.js";

/*
 * The dashboard list is expensive enough to matter on a cold request, but it
 * changes with every vault, member, file and ledger write. Keep it for only a
 * couple of seconds; writes clear every user's entry because a membership or
 * shared vault change can affect more than the caller.
 */
export const VAULT_LIST_CACHE_TTL_MS = 2_000;
const MAX_ENTRIES = 500;

interface CacheEntry {
  value: VaultDTO[];
  expiresAt: number;
  generation: number;
}

const entries = new Map<string, CacheEntry>();
let generation = 0;

function prune(now: number): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now || entry.generation !== generation) entries.delete(key);
  }
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

/** A read captures this before querying, so a write during the query wins. */
export function vaultListCacheGeneration(): number {
  return generation;
}

export function getVaultListCache(userId: string): VaultDTO[] | null {
  const entry = entries.get(userId);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now() || entry.generation !== generation) {
    entries.delete(userId);
    return null;
  }

  return entry.value;
}

export function setVaultListCache(
  userId: string,
  value: VaultDTO[],
  readGeneration: number
): void {
  /* The write invalidated the list while this read was in flight: caching the
     older result now would undo the invalidation. */
  if (readGeneration !== generation) return;

  const now = Date.now();
  prune(now);
  entries.set(userId, {
    value,
    expiresAt: now + VAULT_LIST_CACHE_TTL_MS,
    generation,
  });
}

export function invalidateVaultListCache(): void {
  generation += 1;
  entries.clear();
}
