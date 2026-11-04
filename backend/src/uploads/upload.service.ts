import crypto from "crypto";
import path from "path";
import { database, type DbVaultFileRecord } from "../shared/db.js";
import { storageAdapter, type IStorageAdapter } from "./storage.adapter.js";
import { ZipSecurityValidator } from "./zip.validator.js";
import { dataIsolationService } from "../authorization/isolation.service.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";

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

    // Persist to Supabase public.vault_files if configured
    if (isSupabaseConfigured() && supabase) {
      await supabase.from("vault_files").insert([{
        id: uniqueId,
        vault_id: vaultId,
        uploaded_by: userId,
        file_name: fileRecord.file_name,
        storage_path: fileRecord.storage_path,
        mime_type: fileRecord.mime_type,
        file_size: fileRecord.file_size,
        sha256_hash: fileRecord.sha256_hash,
        created_at: fileRecord.created_at.toISOString(),
      }]);
    }

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
    let file = database.store.files.get(fileId);

    // If not in in-memory store, look up in Supabase
    if (!file && isSupabaseConfigured() && supabase) {
      const { data: dbFile } = await supabase
        .from("vault_files")
        .select("*")
        .eq("id", fileId)
        .single();
      if (dbFile) {
        file = {
          id: dbFile.id,
          vault_id: dbFile.vault_id,
          uploaded_by: dbFile.uploaded_by,
          file_name: dbFile.file_name,
          storage_path: dbFile.storage_path,
          mime_type: dbFile.mime_type,
          file_size: Number(dbFile.file_size),
          sha256_hash: dbFile.sha256_hash,
          created_at: new Date(dbFile.created_at),
        };
      }
    }

    if (!file) {
      throw new NotFoundError("File not found.", "FILE_NOT_FOUND");
    }

    // Access is not enough: the vault must be PAID, or the file stays sealed
    const { vault } = await dataIsolationService.getVaultIfAuthorized(userId, file.vault_id);
    if (String(vault.status) !== "PAID") {
      throw new ForbiddenError(
        "Deliverables stay locked until the vault is paid.",
        "VAULT_NOT_PAID"
      );
    }

    const buffer = await this.storage.read(file.storage_path);
    return {
      file,
      buffer,
    };
  }

  public async listFilesForVault(userId: string, vaultId: string) {
    // Verify access
    await dataIsolationService.getVaultIfAuthorized(userId, vaultId);

    if (isSupabaseConfigured() && supabase) {
      const { data: files } = await supabase
        .from("vault_files")
        .select("id, vault_id, file_name, mime_type, file_size, created_at")
        .eq("vault_id", vaultId)
        .order("created_at", { ascending: false });

      return (files || []).map((f: any) => ({
        id: f.id,
        vaultId: f.vault_id,
        fileName: f.file_name,
        mimeType: f.mime_type,
        fileSize: Number(f.file_size),
        createdAt: f.created_at,
      }));
    }

    // In-memory
    const results: any[] = [];
    for (const f of database.store.files.values()) {
      if (f.vault_id === vaultId) {
        results.push({
          id: f.id,
          vaultId: f.vault_id,
          fileName: f.file_name,
          mimeType: f.mime_type,
          fileSize: f.file_size,
          createdAt: f.created_at,
        });
      }
    }
    return results;
  }
}

export const uploadService = new UploadService();
