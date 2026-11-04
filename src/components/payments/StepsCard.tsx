/* StepsCard.tsx — the three-step story, once per role: four lines with a bolt
   node each, and one sentence under them that says the money part plainly. */

import { useId } from "react";
import { Bolt } from "./icons";

export function StepsCard({ title, steps, note }: { title: string; steps: string[]; note: string }) {
  const id = useId();
  return (
    <section className="pay-card" aria-labelledby={id}>
      <h2 id={id} className="pay-card-h">
        {title}
      </h2>
      <ol className="pay-steps">
        {steps.map((step) => (
          <li key={step} className="pay-step">
            <span className="pay-node" aria-hidden="true">
              <Bolt width="12" height="12" />
            </span>
            <span className="pay-step-text">{step}</span>
          </li>
        ))}
      </ol>
      <p className="pay-note">{note}</p>
    </section>
  );
}
