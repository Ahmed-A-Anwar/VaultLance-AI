import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const MIN_SECRET_LENGTH = 32;

/**
 * Resolve one required secret.
 *
 * There is deliberately no fallback literal here: a fallback is a secret the
 * whole internet can read, and it is what let a token signed with this
 * repository's source authenticate against the deployed API. In production a
 * missing or short secret throws at import time, so the process cannot start
 * and accept traffic. Outside production a random secret is generated for this
 * process only, with a warning that names the variable and never the value.
 */
export function resolveSecret(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = (env[name] || "").trim();
  if (value.length >= MIN_SECRET_LENGTH) return value;

  if ((env.NODE_ENV || "development") === "production") {
    throw new Error(
      `[config] ${name} must be set to at least ${MIN_SECRET_LENGTH} characters in production. ` +
        `Refusing to start. See docs/deploy-secrets.md.`
    );
  }

  const generated = crypto.randomBytes(48).toString("base64");
  console.warn(
    `[config] ${name} is missing or shorter than ${MIN_SECRET_LENGTH} characters; ` +
      `generated a random development secret for this process only. Sessions end on restart.`
  );
  return generated;
}

export const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  frontendUrl: process.env.FRONTEND_URL || "http://127.0.0.1:5173",
  jwt: {
    secret: resolveSecret("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    /* optional: pinned only when configured, never defaulted to something weak */
    issuer: process.env.JWT_ISSUER || undefined,
    audience: process.env.JWT_AUDIENCE || undefined,
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
