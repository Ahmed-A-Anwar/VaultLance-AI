import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

import authRoutes from "./auth/auth.routes.js";
import vaultRoutes from "./vaults/vault.routes.js";
import vaultActionRoutes from "./vaults/vault.actions.js";
import inviteRoutes from "./vaults/invite.routes.js";
import submitRoutes from "./vaults/submit.routes.js";
import downloadRoutes from "./vaults/download.routes.js";
import uploadRoutes from "./uploads/upload.routes.js";
import manifestRoutes from "./manifests/manifest.routes.js";
import ledgerRoutes from "./ledger/ledger.routes.js";
import payoutRoutes from "./money/payout.routes.js";
import aiRoutes from "./ai/ai.routes.js";
import { paypalRouter } from "./paypal/paypal.routes.js";
import { createWebhookRouter } from "./paypal/webhook.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { database } from "./shared/db.js";

dotenv.config();

export const app = express();
export const APP_VERSION = process.env.APP_VERSION || "phase1";

app.use(helmet());

/* Only the configured frontend origins. No wildcard, no dev-friendly fallback:
   a browser on any other origin simply receives no CORS headers. */
const configuredOrigins = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_URL || "http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  ...configuredOrigins,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
  })
);

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

/* The webhook needs the bytes PayPal signed, so its raw parser is mounted
   before the JSON parser and for this path only. */
app.use("/api/webhooks/paypal", express.raw({ type: "*/*", limit: "2mb" }), createWebhookRouter());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: database.isHealthy() ? "healthy" : "degraded",
    version: APP_VERSION,
    service: "VaultPay / VaultLance API",
    timestamp: new Date().toISOString(),
    databaseHealthy: database.isHealthy(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/vaults", paypalRouter); // PayPal order/authorize/capture/void
app.use("/api/vaults", payoutRoutes); // payout retry (additive)
app.use("/api/vaults", vaultActionRoutes); // action routes first (more specific paths)
app.use("/api/vaults", inviteRoutes); // invite codes (additive)
app.use("/api/vaults", submitRoutes); // submit + manifest lock (additive)
app.use("/api/vaults", downloadRoutes); // signed download once PAID (additive)
app.use("/api/vaults", vaultRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/manifests", manifestRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/ai", aiRoutes); // diagnostic for the private AI service

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    error: { code: "ROUTE_NOT_FOUND" },
  });
});

app.use(errorHandler);
