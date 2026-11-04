/**
 * paypal.env.ts — one source of truth for the PayPal endpoint, and the boot guard.
 *
 * This build is sandbox-only: PAYPAL_ENV must be "sandbox" or the process
 * refuses to start. PAYPAL_BASE_URL is ignored on purpose — earlier
 * deployments carried values like the live host or the legacy
 * https://sandbox.paypal.com, and letting either win would point a demo at
 * real money or at a host we do not support. A conflicting value is reported
 * as a warning so the misconfiguration is visible without stopping the app;
 * only an explicitly non-sandbox PAYPAL_ENV is fatal.
 */
import { logger } from "../shared/logger.js";

export const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export const paypalEnvMode = (): string => (process.env.PAYPAL_ENV || "sandbox").toLowerCase();

export const paypalBaseUrl = (): string => PAYPAL_SANDBOX_BASE;

export function assertSandboxPayPal(): void {
  if (process.env.NODE_ENV === "test" || process.env.USE_IN_MEMORY_DB === "true") return;

  const mode = paypalEnvMode();
  if (mode !== "sandbox") {
    throw new Error(
      `PAYPAL_ENV must be "sandbox" for this build (got "${mode}"). Refusing to start.`
    );
  }

  if (process.env.PAYPAL_BASE_URL && process.env.PAYPAL_BASE_URL !== PAYPAL_SANDBOX_BASE) {
    logger.warn(
      `[paypal] PAYPAL_BASE_URL is set and is not the sandbox host; ignoring it and using ${PAYPAL_SANDBOX_BASE}`
    );
  }

  logger.info("[paypal] sandbox mode confirmed");
}
