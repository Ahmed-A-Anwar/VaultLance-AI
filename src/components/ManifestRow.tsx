import { Download } from "./icons";
import { StateToken } from "./StateToken";
import type { MoneyState } from "../lib/store";
import { shortHash, fmtHashSize } from "../lib/money";

/* The manifest only ever holds names, sizes and hashes, so the released row's
   download is the stub the copy promises — a text file stating what it is. */
function downloadStub(path: string, size: number, hash: string) {
  const body = [
    "VaultLance sample file",
    `path: ${path}`,
    `bytes: ${size}`,
    `sha256: ${hash}`,
    "",
    "This is a stub generated from the sealed manifest, not the delivered source.",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || "vaultlance-file.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/*
  Manifest row (shared). variants:
  - locked (client portal while SEALED/AUDITING/HELD): row is one unit, no
    download affordance, tabbables removed — reading only.
  - released (+ /v/[token]/files): real download button per row.
  state from parent money state; token shows SEALED until events arrive.
*/
export function ManifestRow({ path, size, hash, state, released }: {
  path: string; size: number; hash: string; state: MoneyState; released: boolean;
}) {
  const releasedNow = released && (state === "RELEASED" || state === "PAID");
  return (
    <div className="mrow" role="listitem" data-released={releasedNow ? "true" : "false"} data-locked={releasedNow ? "false" : "true"}>
      <span className="mpath" title={path}>
        {releasedNow ? <strong>{path}</strong> : path}
      </span>
      <span className="mnum mono-num" aria-label={`${fmtHashSize(size)}`}>{fmtHashSize(size)}</span>
      <span className="mhash mono-num" aria-hidden="true">{shortHash(hash)}</span>
      <StateToken state={releasedNow ? "RELEASED" : "SEALED"} showWord={releasedNow} />
      {releasedNow && (                <button className="dlbtn" type="button" aria-label={`Download ${path}`} onClick={() => downloadStub(path, size, hash)}>
          <Download /> <span>Get</span>
        </button>
      )}
    </div>
  );
}

export function ManifestList({ items, state, released }: { items: { path: string; size: number; hash: string }[]; state: MoneyState; released: boolean }) {
  return (
    <div className="panel" role="list" aria-label="Manifest">
      <div className="mrow" role="presentation" aria-hidden="true" style={{ paddingTop: 6, paddingBottom: 6 }}>
        <span className="small" style={{ fontWeight: 600 }}>File</span>
        <span className="tiny" style={{ textAlign: "right" }}>Size</span>
        <span className="tiny">sha256</span>
        <span className="tiny" style={{ minWidth: 74, textAlign: "right" }}>State</span>
      </div>
      {items.map((f) => <ManifestRow key={f.path} {...f} state={state} released={released} />)}
    </div>
  );
}
