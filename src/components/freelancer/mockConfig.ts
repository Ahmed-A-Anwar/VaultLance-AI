/* mockConfig.ts — every number the mock API obeys, in one place. When the real
   service is wired these become the server's limits, not the client's, but the
   strings and reasons should stay the same so the UI does not have to change.

   The archive limits mirror backend/src/uploads: 1000 entries, 200 MB
   uncompressed, a 100:1 compression ratio and an extension allowlist. The
   compressed cap is the product's own 100 MB. */

/** Simulated round trip: 300–618ms, the spec's two durations. */
export const LATENCY_MIN_MS = 300;
export const LATENCY_MAX_MS = 618;

/** 5% of calls fail while FX.mockErrors is on, so error states stay reachable. */
export const MOCK_ERROR_RATE = 0.05;

export const ARCHIVE_LIMITS = {
  /** the only extension the uploader accepts */
  acceptedExtension: ".zip",
  /** compressed size cap the dropzone enforces before scanning */
  maxCompressedBytes: 100 * 1024 * 1024,
  /** the backend's uncompressed ceiling */
  maxUncompressedBytes: 200 * 1024 * 1024,
  /** the zip-bomb ratio: uncompressed may not exceed compressed x 100 */
  maxCompressionRatio: 100,
  /** entries after which the archive is refused */
  maxEntries: 1000,
  /** anything on this list fails the file-types check */
  blocked: [".exe", ".dll", ".bat", ".cmd", ".sh", ".msi", ".scr", ".com", ".pif"],
  /** a name containing any of these is treated as a decompression bomb */
  bombMarkers: ["bomb"],
} as const;

export const SCAN_STEPS = ["Archive structure", "File types", "Size limits", "Manifest hash"] as const;
export type ScanStep = (typeof SCAN_STEPS)[number];

/** Hostnames that never count as a public staging URL. */
export const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "169.254.169.254"] as const;

/** 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10 and friends. */
export const PRIVATE_IPV4 =
  /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
