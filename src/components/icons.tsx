import type { SVGProps } from "react";
type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ viewBox: "0 0 16 16", fill: "none", "aria-hidden": true, ...p });

/* seal — the brand mark: a stamp of concentric wax */
export const Seal = (p: P) => (
  <svg {...base(p)}><rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.5" /><path d="M2.5 6h3.2M10.3 6h3.2M2.5 10h3.2M10.3 10h3.2" stroke="currentColor" strokeWidth="1.2" /></svg>
);
export const Lock = (p: P) => (
  <svg {...base(p)}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 7V5.4a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeWidth="1.5" /></svg>
);
export const Scan = (p: P) => (
  <svg {...base(p)}><path d="M2 5.5V3.5A1.5 1.5 0 0 1 3.5 2h2M13.5 2h-2M14 5.5v-2A1.5 1.5 0 0 0 12.5 2M2 10.5v2A1.5 1.5 0 0 0 3.5 14M14 10.5v2a1.5 1.5 0 0 1-1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
);
export const Check = (p: P) => (
  <svg {...base(p)}><path d="M3 8.6 6.2 12 13 4.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const Warn = (p: P) => (
  <svg {...base(p)}><path d="M8 1.8 15 14H1L8 1.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 6.2v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="11.6" r="0.9" fill="currentColor" /></svg>
);
export const Cross = (p: P) => (
  <svg {...base(p)}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
);
export const Download = (p: P) => (
  <svg {...base(p)}><path d="M8 2v8.2M8 10.2 4.8 7M8 10.2 11.2 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 13.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);
export const CloudIn = (p: P) => (
  <svg {...base(p)}><path d="M4.5 13.5h7a3 3 0 1 0-.4-6A4.5 4.5 0 0 0 2.5 8.7a3 3 0 0 0 2 4.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M8 6.2v3.6M6.6 8.4 8 9.9l1.4-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const Fingerprint = (p: P) => (
  <svg {...base(p)}><path d="M5 13.2C4 11.6 3.6 9.9 3.7 8c.06-1.9.5-3 2-3.6S9.3 4 10.3 5.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M12.3 12.5c.6-1.5.8-3 .7-4.5A4.9 4.9 0 0 0 7.4 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M6.2 12.9A9 9 0 0 1 5.6 8c.05-1.4.4-2.3 1.7-2.6S9.6 5.8 10 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M9.9 13.2c.3-.9.5-2 .6-3.2.06-.9-.2-1.7-1-1.9-.8-.2-1.4.3-1.5 1.3-.1 1.2.1 2.6.7 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
);
export const File = (p: P) => (
  <svg {...base(p)}><path d="M4 2.5h5L12.5 6v7.5h-8.5v-11Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M9 2.5V6h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
export const Copy = (p: P) => (
  <svg {...base(p)}><rect x="5.5" y="5.5" width="8" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.4" /><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H4a2 2 0 0 0-2 2v5.5a1.5 1.5 0 0 0 1.5 1.5h2" stroke="currentColor" strokeWidth="1.4" /></svg>
);
export const ArrowRight = (p: P) => (
  <svg {...base(p)}><path d="M2.5 8h10M9 4.5 12.8 8 9 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const Send = (p: P) => (
  <svg {...base(p)}><path d="M14 2 7.3 8.7M14 2 9.6 14l-2.3-5.3L2 6.4 14 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
export const Clock = (p: P) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.8V8l2.2 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
export const Users = (p: P) => (
  <svg {...base(p)}><circle cx="5.6" cy="5.6" r="2.3" stroke="currentColor" strokeWidth="1.4" /><path d="M1.8 13.5c.4-2.4 1.9-3.6 3.8-3.6s3.4 1.2 3.8 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M10.8 3.7a2.2 2.2 0 1 1 .9 4.2M11.5 10c1.6.3 2.5 1.4 2.8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
export const Question = (p: P) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M6.4 6.2c.2-1 1-1.6 1.9-1.5.9 0 1.6.6 1.6 1.4 0 1-1.5 1.2-1.5 2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="11" r="0.9" fill="currentColor" /></svg>
);
