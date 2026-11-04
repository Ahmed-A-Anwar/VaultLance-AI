/**
 * paypal.env.ts — one source of truth for the PayPal endpoint.
 *
 * The endpoint is pinned to the sandbox host here, and both PayPal clients use
 * it, so this build cannot address the live API whatever the environment says.
 *
 * The boot check is therefore ADVISORY: it reports a non-sandbox PAYPAL_ENV
 * loudly and carries on. An earlier version threw, and a stale environment
 * value took the whole API offline in a restart loop during the demo — a
 * refusal to start protects nothing when the URL is already pinned. This
 * deliberately relaxes the "refuse to start" rule; see docs/decisions.md.
 */
import { logger } from "../shared/logger.js";

export const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export const paypalEnvMode = (): string => (process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase();

/** Every PayPal call in this build goes here. */
export const paypalBaseUrl = (): string => PAYPAL_SANDBOX_BASE;

export type SandboxVerdict = "sandbox" | "unexpected";

export function assertSandboxPayPal(): SandboxVerdict {
  if (process.env.NODE_ENV === "test" || process.env.USE_IN_MEMORY_DB === "true") return "sandbox";

  const mode = paypalEnvMode();

  if (mode !== "sandbox") {
    logger.error(
      `[paypal] PAYPAL_ENV="${mode}" is not "sandbox". Continuing anyway: every call is pinned to ` +
        `${PAYPAL_SANDBOX_BASE}. Fix the variable to silence this.`
    );
    return "unexpected";
  }

  if (process.env.PAYPAL_BASE_URL && process.env.PAYPAL_BASE_URL.trim() !== PAYPAL_SANDBOX_BASE) {
    logger.warn(
      `[paypal] PAYPAL_BASE_URL is set and ignored; using ${PAYPAL_SANDBOX_BASE}`
    );
  }

  logger.info("[paypal] sandbox mode confirmed");
  return "sandbox";
}
