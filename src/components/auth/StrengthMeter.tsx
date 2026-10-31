/* StrengthMeter.tsx — the five bolts and their label, plus the rules behind them.

   The rules are read straight off the spec: length, mixed case, a digit, a
   symbol, then the longer length. A level is how many of those the password
   satisfies, which is also what the two callers gate on (level 2 to submit). */

export type StrengthTone = "danger" | "brass" | "teal" | "success";

export interface Strength {
  /* 0..5, one per satisfied rule */
  level: number;
  label: "WEAK" | "OK" | "GOOD" | "STRONG";
  tone: StrengthTone;
  /* the three rules the requirements list names, plus the two the bolts show */
  rules: [boolean, boolean, boolean, boolean, boolean];
}

export const RULES = [
  "8+ characters",
  "Upper and lower case",
  "A number",
] as const;

export function strengthOf(password: string): Strength {
  const rules: [boolean, boolean, boolean, boolean, boolean] = [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
    password.length >= 12,
  ];
  const level = rules.filter(Boolean).length;
  const label: Strength["label"] = level <= 1 ? "WEAK" : level === 2 ? "OK" : level <= 4 ? "GOOD" : "STRONG";
  const tone: StrengthTone =
    level <= 1 ? "danger" : level === 2 ? "brass" : level <= 4 ? "teal" : "success";
  return { level, label, tone, rules };
}

export function StrengthMeter({ level, label, tone, rules }: Strength) {
  return (
    <div className="auth-meter">
      <div className="auth-bolts" aria-hidden="true">
        {rules.map((on, i) => (
          <span className="auth-bolt-track" key={i}>
            <span className="auth-bolt" data-on={on ? "1" : "0"} />
          </span>
        ))}
      </div>
      {/* the visible grade is repeated in the live region, so it is not read twice */}
      <span className="auth-grade" data-tone={tone} data-testid="strength-label" aria-hidden="true">
        {label}
      </span>
      <span className="sr-only" data-testid="strength-level">
        {`strength ${level} of 5`}
      </span>
    </div>
  );
}

/* the list beside the field: what is missing, worded as the spec words it */
export function RequirementList({ strength }: { strength: Strength }) {
  const met = [strength.rules[0], strength.rules[1], strength.rules[2]];
  return (
    <ul className="auth-reqs">
      {RULES.map((text, i) => (
        <li className="auth-req" key={text} data-met={met[i] ? "1" : "0"}>
          <span className="auth-req-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 13l5 5L20 6" />
            </svg>
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}
