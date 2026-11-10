import { app, APP_VERSION } from "./app.js";
import { config } from "./shared/config.js";
import { logger } from "./shared/logger.js";
import { assertSandboxPayPal } from "./shared/paypal.env.js";
import { ensureMoneySchema } from "./money/schema.js";
import { ensureSessionSchema } from "./auth/session.schema.js";
import { ensureAuditSchema } from "./audit/schema.js";
import { startSweeper } from "./money/sweeper.js";
import { runAzureStartupProbe } from "./ai/provider.js";
import { warmVaultListPool } from "./vaults/vault-list.query.js";

const PORT = config.port;

/* Fail loudly before taking traffic if this is pointed at real money. */
assertSandboxPayPal();

/* Idempotent; a no-op without DATABASE_URL (tests, in-memory mode). The
   session table is what lets a login survive a machine change, so it is up
   before the listener takes traffic. */
await ensureMoneySchema();
await ensureSessionSchema();
await ensureAuditSchema();

/* Open the direct database connection before the first dashboard request. */
warmVaultListPool();

app.listen(PORT, () => {
  logger.info(`VaultPay API ${APP_VERSION} running on port ${PORT} [env: ${config.env}]`);
  startSweeper();
  logger.info("Sweeper started: CAPTURE_PENDING vaults are finished every 60s");
  /* One tiny, redacted probe. It never blocks the listener and never logs the
     endpoint, deployment or key. */
  void runAzureStartupProbe();
});
