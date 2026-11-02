import crypto from "crypto";
import path from "path";
import { database, type DbVaultFileRecord } from "../shared/db.js";
import { storageAdapter, type IStorageAdapter } from "./storage.adapter.js";
import { ZipSecurityValidator } from "./zip.validator.js";
import { dataIsolationService } from "../authorization/isolation.service.js";
import { BadRequestError, NotFoundError } from "../shared/errors.js";

export interface ProcessedUploadResult {
  fileId: string;
  vaultId: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  sha256Hash: string;
  isZipArchive: boolean;
  zipDetails?: {
    totalEntries: number;
    totalUncompressedSize: number;
  };
}

export class UploadService {
  constructor(private storage: IStorageAdapter = storageAdapter) {}

  public async processUpload(params: {
    userId: string;
    vaultId: string;
    file: Express.Multer.File;
  }): Promise<ProcessedUploadResult> {
    database.store.checkFailure();
    const { userId, vaultId, file } = params;

    // Verify vault access and ownership (only freelancer owner can upload deliverables)
    await dataIsolationService.assertVaultOwnership(userId, vaultId);

    const ext = path.extname(file.originalname).toLowerCase();
    const isZip = ext === ".zip" || file.mimetype.includes("zip");

    let zipDetails: ProcessedUploadResult["zipDetails"];
    if (isZip) {
      // Perform security checks on zip archive
      const zipValidation = ZipSecurityValidator.validate(file.buffer);
      zipDetails = {
        totalEntries: zipValidation.totalEntries,
        totalUncompressedSize: zipValidation.totalUncompressedSize,
      };
    }

    // Calculate SHA-256 hash server-side
    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");

    // Generate secure randomized object key
    const uniqueId = crypto.randomUUID();
    const safeStorageKey = `vault-${vaultId}-${uniqueId}${ext}`;

    // Store in private storage
    await this.storage.save(safeStorageKey, file.buffer);

    // Save metadata record
    const fileRecord: DbVaultFileRecord = {
      id: uniqueId,
      vault_id: vaultId,
      uploaded_by: userId,
      file_name: path.basename(file.originalname),
      storage_path: safeStorageKey,
      mime_type: file.mimetype,
      file_size: file.size,
      sha256_hash: hash,
      created_at: new Date(),
    };

    database.store.files.set(uniqueId, fileRecord);

    return {
      fileId: uniqueId,
      vaultId,
      fileName: fileRecord.file_name,
      storageKey: safeStorageKey,
      mimeType: fileRecord.mime_type,
      fileSize: fileRecord.file_size,
      sha256Hash: hash,
      isZipArchive: isZip,
      zipDetails,
    };
  }

  public async getFileForDownload(userId: string, fileId: string) {
    database.store.checkFailure();
    const file = database.store.files.get(fileId);
    if (!file) {
      throw new NotFoundError("File not found.", "FILE_NOT_FOUND");
    }

    // Verify user has access to the vault this file belongs to
    await dataIsolationService.getVaultIfAuthorized(userId, file.vault_id);

    const buffer = await this.storage.read(file.storage_path);
    return {
      file,
      buffer,
    };
  }
}

export const uploadService = new UploadService();
