/* Freelancer.tsx — the other side of the vault, not built yet: the rail layout
   stands, the area says so. */

export function FreelancerView({ email }: { email: string }) {
  return (
    <section className="dash-plain" aria-labelledby="freelancer-h">
      <p className="dash-eyebrow">
        <span className="dash-eyebrow-mark" aria-hidden="true" />
        FREELANCER ACCESS
      </p>
      <h2 id="freelancer-h" className="dash-plain-h">
        Freelancer dashboard coming soon
      </h2>
      <p className="dash-mono dim">{email.toUpperCase()}</p>
    </section>
  );
}
