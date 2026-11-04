/* mockConfig.ts — every number the mock API obeys, in one place. The scan
   limits mirror the backend's upload middleware; if the backend changes, this
   is the only file on the frontend that has to follow.

   Latency and the error rate are here for the same reason: the harnesses and
   the dev panel both need to read them, not restate them. */

/** GET/POST latency window, in milliseconds. */
export const MOCK_LATENCY_MS = { min: 300, max: 618 } as const;

/** Share of reads that fail on purpose, behind FX.mockErrors. */
export const MOCK_ERROR_RATE = 0.05;

/** Upload scan limits. Mirrors backend/src/shared/config.ts. */
export const SCAN_RULES = {
  /** one archive, compressed, at most 100 MB */
  maxCompressedBytes: 100 * 1024 * 1024,
  /** at most 1000 entries inside the archive */
  maxEntries: 1000,
  /** 200 MB uncompressed in total */
  maxUncompressedBytes: 200 * 1024 * 1024,
  /** and no entry may expand more than 100:1 */
  maxCompressionRatio: 100,
  /** what the backend's allowlist accepts; the zip itself is the only entry point */
  allowedExtensions: [".zip"] as const,
  /** names the scan refuses outright, both for the reason and for the demo */
  forbiddenNameFragments: ["bomb"] as const,
  /** extensions that fail even inside a zip's name */
  forbiddenExtensions: [".exe"] as const,
} as const;

/** Invite code shape: VL-XXXX-XXXX, no vowels, no look-alikes. */
export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Remind is once per 24h. */
export const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** A failed payout is retryable; the mock succeeds on the retry. */
export const MOCK_PAYPAL_CAPTURE_PREFIX = "8XK";
