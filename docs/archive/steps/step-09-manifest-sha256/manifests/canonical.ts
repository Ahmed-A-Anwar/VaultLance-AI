import crypto from "crypto";
import type { ManifestFileEntry } from "./manifest.types.js";

/**
 * Deterministically sorts an object's keys recursively
 * producing an unambiguous, canonical JSON string representation.
 */
export const canonicalJsonStringify = (data: unknown): string => {
  if (data === null || typeof data !== "object") {
    return JSON.stringify(data);
  }

  if (Array.isArray(data)) {
    return `[${data.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(data as Record<string, unknown>).sort(
    ([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0)
  );

  const stringifiedEntries = entries.map(
    ([key, value]) => `${JSON.stringify(key)}:${canonicalJsonStringify(value)}`
  );

  return `{${stringifiedEntries.join(",")}}`;
};

/**
 * Sorts manifest file entries by stable identifier:
 * Normalized relative path / file name in ascending unicode code point order.
 */
export const sortManifestEntries = (
  entries: ManifestFileEntry[]
): ManifestFileEntry[] => {
  return [...entries].sort((a, b) => {
    const keyA = a.normalizedPath.toLowerCase();
    const keyB = b.normalizedPath.toLowerCase();
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    // Tie-breaker: stable unique ID
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
};

/**
 * Computes SHA-256 hash of a string or buffer
 */
export const sha256 = (content: string | Buffer): string => {
  return crypto.createHash("sha256").update(content).digest("hex");
};
