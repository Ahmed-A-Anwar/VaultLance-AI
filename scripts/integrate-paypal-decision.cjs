const fs = require('fs');
let c = fs.readFileSync('src/components/vault/DecisionPanel.tsx', 'utf8');

if (!c.includes('PayPalAuthorizeButton')) {
  c = c.replace(
    'import { HoldButton } from "../shared/HoldButton";',
    'import { HoldButton } from "../shared/HoldButton";\r\nimport { PayPalAuthorizeButton } from "../shared/PayPalAuthorizeButton";'
  );
}

const targetStr = '<p className="room-hint">Nothing is spent. PayPal holds the amount until you decide.</p>';
if (c.includes(targetStr)) {
  const replacement = `${targetStr}
          {vault?.id && (
            <PayPalAuthorizeButton
              vaultId={vault.id}
              amountUSD={amount}
              onSuccess={() => {
                void reload();
              }}
            />
          )}`;
  c = c.replace(targetStr, replacement);
  fs.writeFileSync('src/components/vault/DecisionPanel.tsx', c, 'utf8');
  console.log('Successfully added PayPalAuthorizeButton into DecisionPanel.tsx');
} else {
  console.error('Target string not found');
}
