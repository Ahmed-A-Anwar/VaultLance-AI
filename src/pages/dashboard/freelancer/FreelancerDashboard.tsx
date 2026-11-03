/* FreelancerDashboard.tsx — "/dashboard" for the freelancer role. This slice
   ships the shell only: the rail, the strip and the page's own landmark are
   live, and the greeting, KPIs, payout banner, cards and ledger land in the
   slices that follow. Kept as a component so FX.freelancerDashboard can hand
   the route back to the coming-soon panel. */

export function FreelancerDashboard({ email }: { email: string }) {
  return (
    <div className="fd fd-bands">
      <section className="fd-panel" aria-labelledby="fd-h">
        <p className="dash-eyebrow">
          <span className="dash-eyebrow-mark" aria-hidden="true" />
          FREELANCER
        </p>
        <h1 id="fd-h" className="fd-h1">
          Your vaults
        </h1>
        <p className="dash-mono dim">{email.toUpperCase()}</p>
      </section>
    </div>
  );
}
