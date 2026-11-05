/**
 * frontend.url.ts — which origin PayPal is allowed to send the browser back to.
 *
 * The return must land on the origin that holds the session. `localhost:5173`
 * and `127.0.0.1:5173` are different origins, so a redirect between them lands
 * on /signin with the payment already approved. The origin that created the
 * order is the only reliable answer, so it wins whenever it is allowed.
 */
import { logger } from "./logger.js";

const LOOPBACK = ["http://localhost:5173", "http://127.0.0.1:5173"];
const strip = (value: string) => value.trim().replace(/\/+$/, "");
const isLoopback = (value: string) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(value);

function configuredOrigins(): string[] {
  return (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map(strip)
    .filter(Boolean);
}

/** Mirrors the CORS allowlist in app.ts: configured origins plus loopback dev. */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  const value = strip(origin);
  return configuredOrigins().includes(value) || LOOPBACK.includes(value);
}

export function frontendBaseUrl(origin?: string | null): string {
  const resolved = isAllowedOrigin(origin)
    ? strip(origin as string)
    : configuredOrigins()[0] || strip(process.env.FRONTEND_URL || "") || LOOPBACK[1];

  if (isLoopback(resolved) && process.env.NODE_ENV === "production") {
    logger.warn(
      `[paypal] returning the browser to ${resolved}; set FRONTEND_URL or FRONTEND_ORIGINS to the deployed frontend`
    );
  }

  return resolved;
}
