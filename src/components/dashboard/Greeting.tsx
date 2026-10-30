/* Greeting.tsx — the upper band's left column. The hour decides the word, the
   audited count decides the line under it; when nothing is waiting the line
   says so plainly, and while the totals are still loading it says nothing at
   all rather than claiming the queue is clear. */

export function partOfDay(hour = new Date().getHours()): string {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function decisionLine(audited: number): string {
  if (audited === 0) return "ALL CLEAR";
  return `${audited} VAULT${audited === 1 ? "" : "S"} NEED${audited === 1 ? "S" : ""} YOUR DECISION`;
}

export function Greeting({
  firstName,
  audited,
  failed = false,
}: {
  firstName: string;
  audited: number | null;
  failed?: boolean;
}) {
  const part = partOfDay();
  /* a read that failed leaves no count: say so rather than shimmer forever */
  const loading = audited === null && !failed;

  return (
    <div className="dash-greeting" data-enter="greeting">
      <h1 className="dash-greeting-h">
        Good {part}, {firstName}.
      </h1>
      <p className="dash-eyebrow dash-greeting-line" aria-busy={loading || undefined}>
        {failed ? (
          "TOTALS UNAVAILABLE"
        ) : loading ? (
          <span className="dash-skel dash-greeting-skel" aria-hidden="true" />
        ) : (
          <>
            <span className="dash-eyebrow-mark" aria-hidden="true" />
            {decisionLine(audited ?? 0)}
          </>
        )}
      </p>
    </div>
  );
}
