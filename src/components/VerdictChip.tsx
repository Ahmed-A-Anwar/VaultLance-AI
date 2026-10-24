import { Check, Warn, Cross } from "./icons";

export function VerdictChip({ tone, children }: { tone: "PASS" | "WARN" | "FAIL"; children?: React.ReactNode }) {
  const Icon = tone === "PASS" ? Check : tone === "WARN" ? Warn : Cross;
  return (
    <span className="chip" data-tone={tone}>
      <Icon />
      {children ?? tone}
    </span>
  );
}

/* COMPUTED vs JUDGED must read as two clearly different things (brief §5) */
export function ComputedRow({ name, tone, detail, note }: { name: string; tone: "PASS" | "WARN" | "FAIL"; detail: string; note?: string }) {
  return (
    <div role="listitem" style={{ display: "flex", gap: "12px", alignItems: "baseline" }}>
      <VerdictChip tone={tone} />
      <span style={{ fontWeight: 560, fontSize: "0.9rem" }}>{name}</span>
      <span className="mono small" style={{ marginLeft: "auto", textAlign: "right" }}>{detail}</span>
      {note && <span className="small" style={{ flexBasis: "100%" }}>{note}</span>}
    </div>
  );
}
