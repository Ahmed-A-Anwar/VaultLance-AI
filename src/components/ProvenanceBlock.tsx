import { Scan, Fingerprint, File, Clock } from "./icons";
import { shortStamp } from "../lib/money";

const ICONS = { scan: Scan, fingerprint: Fingerprint, file: File, clock: Clock } as const;

export interface ProvEntry {
  src: string;
  icon: keyof typeof ICONS;
  body: string;
  payload?: string;
  at?: number;
}

/*
  Provenance block — one item of the evidence stream. Enters with M5
  (opacity/translateY, 180ms), which is *feedback*, so reduced motion keeps the
  fade and drops the movement.
*/
export function ProvenanceBlock({ src, icon, body, payload, at }: ProvEntry) {
  const Icon = ICONS[icon] ?? Clock;
  return (
    <article className="prov" data-src={src}>
      <header className="prov-head">
        <span className="prov-src"><Icon /> {src}</span>
        {at && <span className="prov-time mono-num">{shortStamp(at)}</span>}
      </header>
      <p className="prov-cols">{body}</p>
      {payload && <pre className="prov-payload">{payload}</pre>}
    </article>
  );
}

export function ProvenanceStream({ entries, empty }: { entries: ProvEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="prov-empty">{empty}</p>;
  return <>{entries.map((e, i) => <ProvenanceBlock key={i} {...e} />)}</>;
}
