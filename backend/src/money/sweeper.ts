/**
 * sweeper.ts — the durability net under the webhook.
 *
 * Every 60s, vaults that have been CAPTURE_PENDING for more than 15s are
 * looked up: if the capture exists at PayPal, confirmCapture finishes the job
 * (unlock + payout). This is what survives a restart between the capture call
 * and the webhook, and what covers a webhook that never arrives.
 */
import { logger } from "../shared/logger.js";
import * as store from "./money.store.js";
import { confirmCapture } from "./capture.service.js";

const GRACE_SECONDS = 15;
const INTERVAL_MS = 60_000;

export async function sweepOnce(): Promise<number> {
  const stuck = await store.listCapturePending(GRACE_SECONDS);
  let finished = 0;

  for (const vaultId of stuck) {
    const recorded = await store.getCapture(vaultId);
    if (!recorded) {
      logger.warn(`[sweeper] vault ${vaultId} is CAPTURE_PENDING with no recorded capture yet`);
      continue;
    }
    try {
      const result = await confirmCapture(vaultId, recorded.captureId, "sweeper");
      if (!result.alreadyConfirmed) {
        logger.info(`[sweeper] confirmed via fallback: vault ${vaultId}`);
        finished += 1;
      }
    } catch (err: any) {
      logger.warn(`[sweeper] vault ${vaultId} not ready: ${err?.message || "unknown"}`);
    }
  }

  return finished;
}

export function startSweeper(): NodeJS.Timeout {
  const timer = setInterval(() => {
    void sweepOnce().catch((err) => logger.error(`[sweeper] ${err?.message || err}`));
  }, INTERVAL_MS);
  timer.unref();
  return timer;
}
