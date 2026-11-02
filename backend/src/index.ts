import { app } from "./app.js";
import { config } from "./shared/config.js";
import { logger } from "./shared/logger.js";

const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`VaultPay API server running on port ${PORT} [env: ${config.env}]`);
  logger.info(`Endpoints available:`);
  logger.info(`- POST /api/auth/register`);
  logger.info(`- POST /api/auth/login`);
  logger.info(`- GET  /api/auth/me`);
  logger.info(`- POST /api/vaults`);
  logger.info(`- GET  /api/vaults`);
  logger.info(`- GET  /api/vaults/:id`);
  logger.info(`- PATCH /api/vaults/:id`);
  logger.info(`- POST /api/vaults/:id/invite`);
  logger.info(`- POST /api/vaults/:id/accept`);
  logger.info(`- POST /api/uploads/:vaultId`);
  logger.info(`- GET  /api/manifests/:vaultId`);
});
