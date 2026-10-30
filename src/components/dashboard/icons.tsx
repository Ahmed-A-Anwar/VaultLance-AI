/* icons.tsx — inline SVG only: no icon package is installed, and the spec's one
   allowed dependency is the grid. Same 16-unit grid, 1.5 stroke and round caps
   as components/icons.tsx, so the two sets read as one hand. */

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (p: P) => ({
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

/* the vault mark: a door, a dial, four bolts */
export const VaultGlyph = (p: P) => (
  <svg {...base(p)}>
    <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.6" />
    <circle cx="8" cy="8" r="2.6" />
    <path d="M8 5.4V6.2M8 9.8v.8M5.4 8h.8M9.8 8h.8" />
    <path d="M1.8 7.2h1.2M13 7.2h1.2M1.8 8.8h1.2M13 8.8h1.2" strokeWidth="1.2" />
  </svg>
);

export const Grid = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.2" y="2.2" width="4.8" height="4.8" rx="1" />
    <rect x="9" y="2.2" width="4.8" height="4.8" rx="1" />
    <rect x="2.2" y="9" width="4.8" height="4.8" rx="1" />
    <rect x="9" y="9" width="4.8" height="4.8" rx="1" />
  </svg>
);

/* the ledger: a bound book with a margin rule and three entries. Three plain
   lines read as a hamburger, so the spine and the entries carry the meaning. */
export const Ledger = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.6" y="1.9" width="10.8" height="12.2" rx="1.7" />
    <path d="M6.2 1.9v12.2" />
    <path d="M8.2 5.6h3.2M8.2 8h3.2M8.2 10.4h1.8" strokeWidth="1.3" />
  </svg>
);

export const CardIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.6" />
    <path d="M1.8 6.4h12.4" />
    <path d="M4.4 9.6h2.4" strokeWidth="1.3" />
  </svg>
);

export const Gear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.9v1.6M8 12.5v1.6M1.9 8h1.6M12.5 8h1.6M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1" />
  </svg>
);

export const SignOut = (p: P) => (
  <svg {...base(p)}>
    <path d="M6.4 2.2H3.6a1.4 1.4 0 0 0-1.4 1.4v8.8a1.4 1.4 0 0 0 1.4 1.4h2.8" />
    <path d="M10.4 11.2 13.6 8l-3.2-3.2M6.6 8h7" />
  </svg>
);

export const Bell = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6.6a4 4 0 0 1 8 0c0 2.4.6 3.4 1.2 4H2.8c.6-.6 1.2-1.6 1.2-4Z" />
    <path d="M6.6 12.6a1.6 1.6 0 0 0 2.8 0" />
  </svg>
);

export const Search = (p: P) => (
  <svg {...base(p)}>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.2 10.2 3 3" />
  </svg>
);

export const ChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 6.4 4 4 4-4" />
  </svg>
);

export const Plus = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 3.2v9.6M3.2 8h9.6" />
  </svg>
);

/* the corner wheel that turns on card hover */
export const Wheel = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="4.6" />
    <circle cx="8" cy="8" r="1.2" />
    <path d="M8 3.4v3.4M8 9.2v3.4M3.4 8h3.4M9.2 8h3.4" strokeWidth="1.3" />
  </svg>
);

export const Padlock = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.4" y="7" width="9.2" height="6.4" rx="1.6" />
    <path d="M5.6 7V5.6a2.4 2.4 0 0 1 4.8 0V7" />
  </svg>
);

/* the same lock with the shackle swung open: audited → unlocked */
export const PadlockOpen = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.4" y="7" width="9.2" height="6.4" rx="1.6" />
    <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.6-.9" />
  </svg>
);

export const Clock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 4.8V8l2.2 1.6" />
  </svg>
);

export const Check = (p: P) => (
  <svg {...base(p)}>
    <path d="m3.4 8.4 3 3 6.2-6.8" />
  </svg>
);

export const Copy = (p: P) => (
  <svg {...base(p)}>
    <rect x="5.4" y="5.4" width="8.2" height="8.2" rx="1.6" />
    <path d="M10.6 5.4V4a1.6 1.6 0 0 0-1.6-1.6H4A1.6 1.6 0 0 0 2.4 4v5a1.6 1.6 0 0 0 1.6 1.6h1.4" />
  </svg>
);
