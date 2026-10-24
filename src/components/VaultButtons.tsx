import { useState } from "react";

/*
  Buttons: default / hover (colour-only) / active scale .97 / focus ring /
  disabled (with its own reason text inline) / loading (locked width spinner).
  Reasons are rendered *outside* — caller supplies `reason` for aria + inline text.
*/
export function PrimaryButton({ children, onClick, disabled, reason, loading, full, type = "button", testid }: {
  children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: string | boolean;
  reason?: React.ReactNode; loading?: boolean; full?: boolean; type?: "button" | "submit"; testid?: string;
}) {
  const isOff = Boolean(disabled) || loading;
  return (
    <>
      <button className={`btn${full ? " full" : ""}`} type={type} onClick={onClick}
        disabled={isOff || undefined} aria-disabled={Boolean(disabled) || undefined}
        aria-describedby={disabled ? `${testid ?? "btn"}-reason` : undefined} data-testid={testid}>
        {loading && <span className="spin" aria-hidden="true" />}
        {children}
      </button>
      {disabled && <p className="reason" id={testid ? `${testid}-reason` : undefined}>{reason ?? disabled}</p>}
    </>
  );
}

export function GhostButton({ children, onClick, small, ariaLabel }: {
  children: React.ReactNode; onClick?: () => void; small?: boolean; ariaLabel?: string;
}) {
  return (
    <button className="btn ghost" style={small ? { padding: "7px 12px", fontSize: "0.85rem" } : undefined}
      type="button" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

/* Copy affordance with a "Copied" transient — feedback, not decoration. */
export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
  };
  return (
    <button className="dlbtn" data-testid="copy-link" type="button" onClick={copy} aria-label={label}>
      {copied ? "Copied" : label}
    </button>
  );
}
