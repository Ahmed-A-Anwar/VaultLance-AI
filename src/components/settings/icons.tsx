/* icons.tsx — the few glyphs settings needs that the dashboard's set does not
   already draw. Same 16-unit grid, 1.5 stroke, round caps, so they sit with the
   rail's icons as one hand. */

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

export const Camera = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.2 5.6h2.2l1-1.6h5.2l1 1.6h2.2v7.2H2.2z" />
    <circle cx="8" cy="9" r="2.2" />
  </svg>
);

export const EnvelopeCheck = (p: P) => (
  <svg {...base(p)}>
    <rect x="1.6" y="3.4" width="10.4" height="7.8" rx="1.4" />
    <path d="M2.2 4.4 6.8 7.6l4.6-3.2" />
    <path d="m9.6 12 1.8 1.8 3.2-3.6" />
  </svg>
);

export const ShieldCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 1.8 13.4 4v4.2c0 3-2.4 5.4-5.4 6-3-0.6-5.4-3-5.4-6V4z" />
    <path d="m5.4 7.9 1.8 1.9 3.4-3.7" />
  </svg>
);

export const Laptop = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="10" height="6.8" rx="1.2" />
    <path d="M1.6 11.8h12.8" />
  </svg>
);

export const Phone = (p: P) => (
  <svg {...base(p)}>
    <rect x="4.4" y="1.6" width="7.2" height="12.8" rx="1.6" />
    <path d="M7 12.2h2" />
  </svg>
);

export const Monitor = (p: P) => (
  <svg {...base(p)}>
    <rect x="1.8" y="2.6" width="12.4" height="8" rx="1.3" />
    <path d="M6 13.4h4M8 10.6v2.8" />
  </svg>
);

export const Key = (p: P) => (
  <svg {...base(p)}>
    <circle cx="5.4" cy="5.4" r="2.6" />
    <path d="m7.3 7.3 5.3 5.3M10.4 9.6l-1.2 1.2M12.2 11.4l-1.2 1.2" />
  </svg>
);
