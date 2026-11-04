const fs = require('fs');
const f = 'c:/Users/omarw/Downloads/VaultLance-AI/src/components/vault/DecisionPanel.tsx';
let src = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

src = src.replace(
  'const { vault, status, busy, authorize, approve, reject, capturedAt, reload } = useRoom();',
  'const { vault, status, busy, authorize, approve, reject, capturedAt, reload, checks } = useRoom();'
);

src = src.replace(
  'const amount = vault?.amountUSD ?? 0;',
  'const amount = vault?.amountUSD ?? 0;\n  const hasFailedChecks = checks.some((c) => c.result === "fail" || c.state === "fail");'
);

src = src.replace(
  'disabled={status !== "audited" || busy === "reject"}',
  'disabled={status !== "audited" || busy === "reject" || hasFailedChecks}'
);

src = src.replace(
  '{status === "held" && <p className="room-hint room-hint-sm">Run the audit first.</p>}',
  '{status === "held" && <p className="room-hint room-hint-sm">Run the audit first.</p>}\n          {status === "audited" && hasFailedChecks && (\n            <p className="room-hint room-hint-sm" style={{ color: "#d9534f" }}>\n              ⚠️ Verification failed. Payment locked until issues are resolved.\n            </p>\n          )}'
);

src = src.replace(/\n/g, '\r\n');
fs.writeFileSync(f, src);
console.log('OK');
