/* icons.tsx — the three glyphs the Payments page needs that the dashboard
   icon set does not carry. Neutral shapes only: the wallet is not PayPal's
   mark, and the bolt is the step node. */

type P = React.SVGProps<SVGSVGElement>;

export const WalletIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...p}>
    <rect x="3" y="6" width="18" height="13" rx="3" />
    <path d="M3 10h18" strokeLinecap="round" />
    <circle cx="17" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const Bolt = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...p}>
    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" strokeLinejoin="round" />
  </svg>
);

export const Refresh = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" strokeLinecap="round" />
    <path d="M20 4v7h-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
