import path from "path";
import { config } from "../shared/config.js";

export const uploadConfig = {
  maxFileSize: config.uploads.maxFileSizeBytes, // 50MB
  maxUncompressedZipSize: config.uploads.maxUncompressedZipSizeBytes, // 200MB
  maxZipEntries: config.uploads.maxZipEntries, // 1000
  maxCompressionRatio: config.uploads.maxCompressionRatio, // 100:1
  allowedMimeTypes: config.uploads.allowedMimeTypes,
  allowedExtensions: config.uploads.allowedExtensions,
  dangerousExtensions: [
    ".exe",
    ".bat",
    ".cmd",
    ".sh",
    ".vbs",
    ".dll",
    ".msi",
    ".scr",
    ".ps1",
    ".com",
    ".pif",
  ],
  storageDirectory: path.resolve(process.cwd(), config.uploads.storageDir),
};
