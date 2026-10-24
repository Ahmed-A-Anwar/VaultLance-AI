import { fmt } from "../lib/money";
import type { MoneyState } from "../lib/store";

/* AmountReadout — tabular monospace, size + tone variants; aria-live on change. */
export function AmountReadout({ cents, size = "m", tone = "held", label }: {
  cents: number; size?: "s" | "m" | "l"; tone?: "held" | "paid" | "voided" | "ink"; label?: string;
}) {
  return (
    <span className="amt mono-num" data-size={size} data-tone={tone} aria-live={size === "l" ? "polite" : undefined}>
      <span className="sr-only">{label ?? `${fmt(cents)} ${tone === "held" ? "held, not captured" : ""}`}</span>
      <span aria-hidden="true">{fmt(cents)}</span>
    </span>
  );
}

/*
  FreezeBar — the held→captured/voided progression. PLAN M6: fill via clip-path,
  900ms linear; hatched when VOIDED; state text never colour-only.
*/
export function FreezeBar({ cents, state, caption }: { cents: number; state: MoneyState; caption?: string }) {
  const pct = state === "PAID" || state === "RELEASED" ? 100 : state === "CAPTURED" ? 100 : 100;
  return (
    <div className="freeze" data-mode={state === "VOIDED" ? "voided" : state === "CAPTURED" || state === "PAID" || state === "RELEASED" ? "captured" : "held"}>
      <div className="freeze-top">
        <span className="small" style={{ fontWeight: 600 }}>
          {state === "VOIDED" ? "Authorization voided" : "Authorization held — not captured"}
        </span>
        <AmountReadout cents={cents} size="s" tone={state === "VOIDED" ? "voided" : state === "PAID" ? "paid" : "held"} />
      </div>
      <div className="freeze-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Money state">
        <div className="freeze-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="freeze-foot">{caption ?? "This is a hold on the client's card. Capture is a separate step that needs a verdict."}</p>
    </div>
  );
}
