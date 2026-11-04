const fs = require('fs');
let c = fs.readFileSync('src/components/dashboard/VaultCard.tsx', 'utf8');

if (!c.includes('PayPalAuthorizeButton')) {
  c = c.replace(
    'import { HoldButton } from "../shared/HoldButton";',
    'import { HoldButton } from "../shared/HoldButton";\r\nimport { PayPalAuthorizeButton } from "../shared/PayPalAuthorizeButton";'
  );
}

const targetLine = '{vault.status === "awaiting_payment" && (';
const endLine = '          )}';

const targetIdx = c.indexOf(targetLine);
if (targetIdx !== -1) {
  const nextClosingIdx = c.indexOf(endLine, targetIdx);
  if (nextClosingIdx !== -1) {
    const originalSection = c.slice(targetIdx, nextClosingIdx + endLine.length);
    const newSection = `{vault.status === "awaiting_payment" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <PayPalAuthorizeButton
                vaultId={vault.id}
                amountUSD={vault.amountUSD}
                onSuccess={(data: any) => {
                  putVault({ ...vault, status: "held", paypalOrderId: data.authorizationId || data.orderId });
                }}
                disabled={blocked}
              />
              <button
                type="button"
                className="dash-btn dash-btn-ghost"
                style={{ fontSize: "11px", padding: "4px 8px" }}
                onClick={() => void act("authorize")}
                disabled={blocked}
              >
                <span className="dash-btn-label">{busy === "authorize" ? "Authorizing…" : "Instant Mock Authorize"}</span>
                {busy === "authorize" ? spinner : <span className="dash-btn-arrow" aria-hidden="true">→</span>}
              </button>
            </div>
          )}`;
    c = c.replace(originalSection, newSection);
    fs.writeFileSync('src/components/dashboard/VaultCard.tsx', c, 'utf8');
    console.log('Successfully added PayPalAuthorizeButton to dashboard VaultCard.tsx');
  } else {
    console.error('End of awaiting_payment block not found');
  }
} else {
  console.error('Target awaiting_payment block not found');
}
