import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CopyButton } from "./VaultButtons";

/* QR is generated locally (no third-party QR API — see RESEARCH.md goQR note). */
export function QrPanel({ url, caption }: { url: string; caption?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((s) => { if (alive) setSvg(s); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [url]);
  return (
    <div className="qr">
      {failed ? (
        <p className="tiny">QR generation failed — the plain link below still works.</p>
      ) : (
        <div className="qr-img" role="img" aria-label={`QR code for ${url}`}
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <code className="small" style={{ wordBreak: "break-all" }}>{url}</code>
        <CopyButton text={url} />
      </div>
      {caption && <p className="tiny">{caption}</p>}
    </div>
  );
}
