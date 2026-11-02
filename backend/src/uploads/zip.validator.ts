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
