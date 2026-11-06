/**
 * Join attempts are cheap to guess and expensive to leak: ten failures per
 * fifteen minutes, counted per signed-in user and per address. Only failures
 * consume the budget, so a client who joins successfully is never punished for
 * it, while a code-guessing loop stops after ten tries.
 *
 * In memory on purpose: the API runs one machine and the limiter is a guard
 * rail, not an accounting record. A restart clears it.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const keysFor = (userId: string, ip: string): string[] => [`user:${userId}`, `ip:${ip}`];

/** Is this caller still allowed to try? When not, how long until they are. */
export function joinLimit(userId: string, ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let allowed = true;
  let retryAfterSeconds = 0;

  for (const key of keysFor(userId, ip)) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) continue;
    if (bucket.count >= MAX_FAILURES) {
      allowed = false;
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((bucket.resetAt - now) / 1000));
    }
  }

  return { allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, retryAfterSeconds) };
}

/** Record one failed attempt against both the user and the address. */
export function noteJoinFailure(userId: string, ip: string): void {
  const now = Date.now();
  for (const key of keysFor(userId, ip)) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      continue;
    }
    bucket.count += 1;
  }
}

/** Tests only: forget every window. */
export function resetJoinLimits(): void {
  buckets.clear();
}

export const JOIN_LIMIT = { windowMs: WINDOW_MS, maxFailures: MAX_FAILURES };
