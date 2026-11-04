/* formatRelative.ts — the one place that turns a time into "3h ago". Accepts a
   Date, an ISO string or ms since the epoch, because the freelancer ledger
   hydrates events from sessionStorage where the previous build stored `ts`
   and the current one stores an ISO `at`. Anything unparsable renders "—"
   with a single console warning per distinct value — never "NaNd ago". */

const warned = new Set<string>();

/** ms since the epoch, or null when the input is not a time. */
export function toMs(input: unknown): number | null {
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return null;
    const t = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function warnOnce(input: unknown): void {
  const key = typeof input === "string" ? input : String(input);
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`formatRelative: not a time, rendering an em dash: ${key.slice(0, 80)}`);
}

export function formatRelative(input: unknown, now: number | Date = Date.now()): string {
  const t = toMs(input);
  if (t === null) {
    warnOnce(input);
    return "—";
  }
  const base = now instanceof Date ? now.getTime() : now;
  const s = Math.max(0, Math.round((base - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
