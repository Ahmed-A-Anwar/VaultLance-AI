/* StatusLine.tsx — the one mono line of the reset screens. On desktop it sits in
   the strip left of the card; under 1100px the strip is gone and the same line
   appears above the H1. Only the one the media query shows reaches the
   accessibility tree, so a state is announced once. */

export type StatusTone = "steel" | "teal" | "success" | "danger";

export interface StatusLineProps {
  text: string;
  tone?: StatusTone;
  /* the teal dot breathes while a link is out */
  pulse?: boolean;
  inline?: boolean;
}

export function StatusLine({ text, tone = "steel", pulse = false, inline = false }: StatusLineProps) {
  return (
    <p
      className={`signin-status auth-status${inline ? " signin-status-inline" : ""}`}
      data-tone={tone}
      data-pulse={pulse ? "1" : undefined}
      role="status"
      data-testid={inline ? "auth-status-inline" : "auth-status"}
    >
      <span className="signin-status-dot" aria-hidden="true" />
      {text}
    </p>
  );
}
