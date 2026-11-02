import dotenv from "dotenv";
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  frontendUrl: process.env.FRONTEND_URL || "http://127.0.0.1:5173",
  jwt: {
    secret: process.env.JWT_SECRET || "vaultlance-secure-jwt-secret-key-change-in-production-32chars!",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  },
  session: {
    ttlSeconds: parseInt(process.env.SESSION_TTL_SECONDS || "604800", 10), // 7 days
    cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
  },
  uploads: {
    maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || "52428800", 10), // 50MB
    maxTotalUploadSizeBytes: 104857600, // 100MB
    maxZipEntries: 1000,
    maxUncompressedZipSizeBytes: 209715200, // 200MB
    maxCompressionRatio: 100, // 100:1 ratio defense against zip bombs
    allowedMimeTypes: [
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/svg+xml",
      "text/plain",
      "text/markdown",
      "application/json",
    ],
    allowedExtensions: [
      ".zip",
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".svg",
      ".txt",
      ".md",
      ".json",
    ],
    storageDir: process.env.UPLOAD_DIR || "storage/vaults",
  },
  demoMode: process.env.DEMO_MODE === "true" || process.env.VITE_DEMO_MODE === "true",
};
