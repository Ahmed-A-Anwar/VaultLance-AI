/* SectionCard.tsx — one settings section: the number of the nav item, the two
   type sizes the spec fixes (Fraunces 26 title, 12px mono caption), the glass,
   and the dirty footer's slot. Everything else is the section's own business. */

import type { ReactNode } from "react";

export interface SectionCardProps {
  id: string;
  title: string;
  caption?: string;
  tone?: "default" | "danger";
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function SectionCard({
  id,
  title,
  caption,
  tone = "default",
  action,
  children,
  footer,
  className,
}: SectionCardProps) {
  return (
    <section
      id={id}
      className={`set-card${tone === "danger" ? " is-danger" : ""}${className ? ` ${className}` : ""}`}
      aria-labelledby={`${id}-h`}
      data-section={id}
      tabIndex={-1}
    >
      <header className="set-card-head">
        <div className="set-card-titles">
          <h2 id={`${id}-h`} className="set-card-h">
            {title}
          </h2>
          {caption && (
            <p className="set-card-cap" data-tone={tone}>
              {caption}
            </p>
          )}
        </div>
        {action}
      </header>
      <div className="set-card-body">{children}</div>
      {footer}
    </section>
  );
}
