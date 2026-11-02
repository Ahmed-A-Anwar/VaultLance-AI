import { database } from "../shared/db.js";
import { dataIsolationService } from "../authorization/isolation.service.js";
import {
  canonicalJsonStringify,
  sortManifestEntries,
  sha256,
} from "./canonical.js";
import type {
  CanonicalManifest,
  ManifestFileEntry,
  ManifestVerificationResult,
} from "./manifest.types.js";
import { NotFoundError } from "../shared/errors.js";

export class ManifestService {
  public async generateVaultManifest(
    userId: string,
    vaultId: string
  ): Promise<CanonicalManifest> {
    database.store.checkFailure();
    // Authorize participant access
    const { vault } = await dataIsolationService.getVaultIfAuthorized(userId, vaultId);

    // Retrieve all files in vault
    const fileRecords = Array.from(database.store.files.values()).filter(
      (f) => f.vault_id === vaultId
    );

    const unsortedEntries: ManifestFileEntry[] = fileRecords.map((f) => ({
      id: f.id,
      fileName: f.file_name,
      normalizedPath: f.file_name.toLowerCase().replace(/\\/g, "/"),
      sizeBytes: Number(f.file_size),
      mimeType: f.mime_type,
      sha256: f.sha256_hash,
      createdAt: f.created_at.toISOString(),
    }));

    // Sort entries deterministically by stable identifier
    const sortedEntries = sortManifestEntries(unsortedEntries);

    const totalFiles = sortedEntries.length;
    const totalSizeBytes = sortedEntries.reduce(
      (sum, item) => sum + item.sizeBytes,
      0
    );

    // Stable manifest payload without non-deterministic metadata
    const manifestPayload = {
      vaultId: vault.id,
      totalFiles,
      totalSizeBytes,
      files: sortedEntries.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        normalizedPath: f.normalizedPath,
        sizeBytes: f.sizeBytes,
        mimeType: f.mimeType,
        sha256: f.sha256,
      })),
    };

    const canonicalString = canonicalJsonStringify(manifestPayload);
    const manifestHash = sha256(canonicalString);

    return {
      vaultId: vault.id,
      totalFiles,
      totalSizeBytes,
      files: sortedEntries,
      canonicalString,
      manifestHash,
      generatedAt: new Date().toISOString(),
    };
  }

  public verifyReproducibility(
    manifest: CanonicalManifest
  ): ManifestVerificationResult {
    // Reconstruct the exact canonical structure from files
    const sortedEntries = sortManifestEntries(manifest.files);

    const reconstructedPayload = {
      vaultId: manifest.vaultId,
      totalFiles: sortedEntries.length,
      totalSizeBytes: sortedEntries.reduce((sum, f) => sum + f.sizeBytes, 0),
      files: sortedEntries.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        normalizedPath: f.normalizedPath,
        sizeBytes: f.sizeBytes,
        mimeType: f.mimeType,
        sha256: f.sha256,
      })),
    };

    const reconstructedCanonicalString = canonicalJsonStringify(reconstructedPayload);
    const recomputedHash = sha256(reconstructedCanonicalString);

    const isMatch =
      recomputedHash.toLowerCase() === manifest.manifestHash.toLowerCase() &&
      reconstructedCanonicalString === manifest.canonicalString;

    return {
      verified: isMatch,
      expectedHash: manifest.manifestHash,
      computedHash: recomputedHash,
      totalFiles: sortedEntries.length,
      reproducible: isMatch,
      checkedAt: new Date().toISOString(),
    };
  }
}

export const manifestService = new ManifestService();
