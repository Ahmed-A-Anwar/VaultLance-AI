export const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const fmtHashSize = (bytes: number) =>
  bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

/* sandbox ids read like ids, but are demonstrably generated here */
export const sandboxId = (prefix: string) =>
  `${prefix}_${Array.from({ length: 10 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("")}`;

export const stamp = (d: Date | number | string) =>
  new Date(d).toISOString().replace("T", " ").replace("Z", " UTC");

export const shortStamp = (d: Date | number | string) =>
  new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

export const pence = (whole: string) => {
  const n = Number(whole.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
