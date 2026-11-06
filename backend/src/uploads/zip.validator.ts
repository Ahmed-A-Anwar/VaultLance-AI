import AdmZip from "adm-zip";
import path from "path";
import { uploadConfig } from "./upload.config.js";
import { SecurityError } from "../shared/errors.js";

export interface ZipValidationResult {
  valid: boolean;
  totalEntries: number;
  totalUncompressedSize: number;
  entries: Array<{
    name: string;
    size: number;
    compressedSize: number;
    isDirectory: boolean;
  }>;
}

export class ZipSecurityValidator {
  public static validate(buffer: Buffer): ZipValidationResult {
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      throw new SecurityError("Invalid or corrupted ZIP archive format.", "INVALID_ZIP_ARCHIVE");
    }

    const zipEntries = zip.getEntries();
    const totalEntries = zipEntries.length;

    if (totalEntries === 0) {
      throw new SecurityError("ZIP archive is empty.", "EMPTY_ZIP_ARCHIVE");
    }

    if (totalEntries > uploadConfig.maxZipEntries) {
      throw new SecurityError(
        `ZIP archive exceeds maximum entry count of ${uploadConfig.maxZipEntries} files (found ${totalEntries}).`,
        "ZIP_ENTRY_LIMIT_EXCEEDED"
      );
    }

    let totalUncompressedSize = 0;
    const entriesList: ZipValidationResult["entries"] = [];

    for (const entry of zipEntries) {
      const entryName = entry.entryName;

      // 1. Zip Slip Protection: Check for path traversal sequences FIRST
      if (
        entryName.includes("..") ||
        path.isAbsolute(entryName) ||
        entryName.startsWith("/") ||
        entryName.startsWith("\\")
      ) {
        throw new SecurityError(
          `Zip Slip vulnerability detected: malicious entry path '${entryName}'`,
          "ZIP_SLIP_DETECTED"
        );
      }

      // 2. Dangerous executable extension check
      const ext = path.extname(entryName).toLowerCase();
      if (uploadConfig.dangerousExtensions.includes(ext)) {
        throw new SecurityError(
          `ZIP archive contains disallowed executable file: '${entryName}'`,
          "DANGEROUS_FILE_EXTENSION"
        );
      }

      // Symlink entries can point outside the extraction directory. Reject
      // them before any size/hash inspection; the archive is never executed.
      const unixMode = (Number(entry.header.attr) >>> 16) & 0o170000;
      if (unixMode === 0o120000) {
        throw new SecurityError(
          `ZIP archive contains a symlink entry: '${entryName}'`,
          "ZIP_SYMLINK_REJECTED"
        );
      }

      // A zip inside the delivery is one level deep and allowed. Anything
      // inside that nested zip is rejected, and the nested zip is inspected
      // as data (never extracted to disk or executed).
      if (!entry.isDirectory && /\.zip$/i.test(entryName)) {
        try {
          const nested = new AdmZip(entry.getData());
          for (const inner of nested.getEntries()) {
            const innerMode = (Number(inner.header.attr) >>> 16) & 0o170000;
            if (innerMode === 0o120000) {
              throw new SecurityError(
                `Nested ZIP contains a symlink entry: '${inner.entryName}'`,
                "ZIP_SYMLINK_REJECTED"
              );
            }
            if (/\.zip$/i.test(inner.entryName)) {
              throw new SecurityError(
                `Nested ZIP '${entryName}' exceeds the allowed archive depth of 1.`,
                "ZIP_NESTING_DEPTH_EXCEEDED"
              );
            }
          }
        } catch (err) {
          if (err instanceof SecurityError) throw err;
          throw new SecurityError(
            `Nested ZIP '${entryName}' could not be inspected safely.`,
            "INVALID_NESTED_ZIP"
          );
        }
      }

      const uncompressedSize = entry.header.size;
      const compressedSize = entry.header.compressedSize;

      totalUncompressedSize += uncompressedSize;

      // 3. Zip Bomb check per entry: compression ratio
      if (compressedSize > 0) {
        const ratio = uncompressedSize / compressedSize;
        if (ratio > uploadConfig.maxCompressionRatio) {
          throw new SecurityError(
            `Potential Zip Bomb detected: Entry '${entryName}' has suspicious compression ratio (${ratio.toFixed(
              1
            )}:1). Maximum allowed is ${uploadConfig.maxCompressionRatio}:1.`,
            "ZIP_BOMB_DETECTED"
          );
        }
      }

      entriesList.push({
        name: entryName,
        size: uncompressedSize,
        compressedSize,
        isDirectory: entry.isDirectory,
      });
    }

    // 4. Total uncompressed size limit
    if (totalUncompressedSize > uploadConfig.maxUncompressedZipSize) {
      throw new SecurityError(
        `Uncompressed ZIP size (${(totalUncompressedSize / 1024 / 1024).toFixed(
          1
        )} MB) exceeds maximum allowed size of ${
          uploadConfig.maxUncompressedZipSize / 1024 / 1024
        } MB.`,
        "ZIP_TOTAL_SIZE_EXCEEDED"
      );
    }

    return {
      valid: true,
      totalEntries,
      totalUncompressedSize,
      entries: entriesList,
    };
  }
}
