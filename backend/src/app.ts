import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

import authRoutes from "./auth/auth.routes.js";
import vaultRoutes from "./vaults/vault.routes.js";
import vaultActionRoutes from "./vaults/vault.actions.js";
import uploadRoutes from "./uploads/upload.routes.js";
import manifestRoutes from "./manifests/manifest.routes.js";
import ledgerRoutes from "./ledger/ledger.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { database } from "./shared/db.js";

dotenv.config();

export const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Dev-friendly fallback
    },
    credentials: true,
  })
);

// Morgan request logging (disabled in test)
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// JSON body parser with 10MB limit
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: database.isHealthy() ? "healthy" : "degraded",
    service: "VaultPay / VaultLance API",
    timestamp: new Date().toISOString(),
    databaseHealthy: database.isHealthy(),
  });
});

// Mount modular API routers
app.use("/api/auth", authRoutes);
app.use("/api/vaults", vaultActionRoutes);  // action routes first (more specific paths)
app.use("/api/vaults", vaultRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/manifests", manifestRoutes);
app.use("/api/ledger", ledgerRoutes);

// 404 handler for unmatched routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    error: { code: "ROUTE_NOT_FOUND" },
  });
});

// Centralized error handler
app.use(errorHandler);
