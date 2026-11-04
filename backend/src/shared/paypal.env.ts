/**
 * paypal.env.ts — refuse to run against anything but the PayPal sandbox.
 *
 * PAYPAL_ENV must be "sandbox". The brief is explicit: this build serves a
 * sandbox demo, and a misconfigured deployment must fail loudly at boot
 * rather than quietly move real money.
 */
import { logger } from "../shared/logger.js";

export function assertSandboxPayPal(): void {
  const env = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
  if (process.env.NODE_ENV === "test" || process.env.USE_IN_MEMORY_DB === "true") return;

  if (env !== "sandbox") {
    throw new Error(
      `PAYPAL_ENV must be "sandbox" for this build (got "${env}"). Refusing to start.`
    );
  }

  const base = process.env.PAYPAL_BASE_URL;
  if (base && !base.startsWith("https://api-m.sandbox.paypal.com")) {
    throw new Error(
      "PAYPAL_BASE_URL must be https://api-m.sandbox.paypal.com for this build. Refusing to start."
    );
  }

  logger.info("[paypal] sandbox mode confirmed");
}
