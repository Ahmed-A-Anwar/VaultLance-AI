/* icons.tsx — the audit room's inline SVG, on the same 16-unit grid, 1.5 stroke
   and round caps as the dashboard's set, so the two rooms read as one hand. */

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

export const ArrowLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M12.6 8H3.4M7.2 3.8 3 8l4.2 4.2" />
  </svg>
);

export const Send = (p: P) => (
  <svg {...base(p)}>
    <path d="M13.4 2.6 6.8 9.2M13.4 2.6 9.4 13.4l-2.6-4.2-4.2-2.6 10.8-4Z" />
  </svg>
);

export const Play = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.6 2.9 12.8 8l-8.2 5.1V2.9Z" />
  </svg>
);

export const Lock = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.4" y="7" width="9.2" height="6.4" rx="1.6" />
    <path d="M5.6 7V5.6a2.4 2.4 0 0 1 4.8 0V7" />
  </svg>
);

export const LockOpen = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.4" y="7" width="9.2" height="6.4" rx="1.6" />
    <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.6-.9" />
  </svg>
);

export const FileIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 1.9h5l3 3v9.2H4V1.9Z" />
    <path d="M9 1.9v3h3" />
  </svg>
);

export const Folder = (p: P) => (
  <svg {...base(p)}>
    <path d="M1.9 4.1h4.2l1.3 1.6h6.7v6.6a1.6 1.6 0 0 1-1.6 1.6H3.5a1.6 1.6 0 0 1-1.6-1.6V4.1Z" />
  </svg>
);

export const Globe = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.9" />
    <path d="M2.1 8h11.8M8 2.1c1.6 1.7 2.4 3.7 2.4 5.9S9.6 12.2 8 13.9C6.4 12.2 5.6 10.2 5.6 8S6.4 3.8 8 2.1Z" />
  </svg>
);

export const Chevron = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 6.4 4 4 4-4" />
  </svg>
);

export const Check = (p: P) => (
  <svg {...base(p)}>
    <path d="m3.4 8.4 3 3 6.2-6.8" />
  </svg>
);

export const Alert = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 2.4 14 13H2L8 2.4Z" />
    <path d="M8 6.4v3M8 11.3v.2" />
  </svg>
);

export const X = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
);

export const Copy = (p: P) => (
  <svg {...base(p)}>
    <rect x="5.4" y="5.4" width="8.2" height="8.2" rx="1.6" />
    <path d="M10.6 5.4V4a1.6 1.6 0 0 0-1.6-1.6H4A1.6 1.6 0 0 0 2.4 4v5a1.6 1.6 0 0 0 1.6 1.6h1.4" />
  </svg>
);

export const Download = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 2.6v7.2M5.2 7l2.8 2.8L10.8 7M2.8 12.6h10.4" />
  </svg>
);

export const Bolt = (p: P) => (
  <svg {...base(p)}>
    <path d="M8.6 1.9 4 9h3.2l-.8 5.1L11.6 7H8.4l.2-5.1Z" />
  </svg>
);

export const Clock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 4.8V8l2.2 1.6" />
  </svg>
);

/* the spinning state: a partial ring, turned by CSS */
export const Spinner = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 2.2a5.8 5.8 0 1 1-5.8 5.8" />
  </svg>
);
