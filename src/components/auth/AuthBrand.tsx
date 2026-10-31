/* AuthBrand.tsx — the wordmark and the way back. Same block as /signin's, which
   is why it wears the same class names; on /forgot-password the link goes back to
   /signin rather than "/". */

import { Link } from "react-router-dom";

const ARROW = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 5l-7 7 7 7" />
  </svg>
);

export interface AuthBrandProps {
  to: string;
  label?: string;
}

export function AuthBrand({ to, label = "Back" }: AuthBrandProps) {
  return (
    <div className="signin-brand">
      <span className="signin-wordmark">VaultLance AI</span>
      <Link className="signin-home" to={to} data-testid="auth-back">
        {ARROW}
        {label}
      </Link>
    </div>
  );
}
