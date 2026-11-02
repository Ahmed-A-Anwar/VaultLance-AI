export interface ManifestFileEntry {
  id: string;
  fileName: string;
  normalizedPath: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  createdAt: string;
}

export interface CanonicalManifest {
  vaultId: string;
  totalFiles: number;
  totalSizeBytes: number;
  files: ManifestFileEntry[];
  canonicalString: string;
  manifestHash: string;
  generatedAt: string;
}

export interface ManifestVerificationResult {
  verified: boolean;
  expectedHash: string;
  computedHash: string;
  totalFiles: number;
  reproducible: boolean;
  checkedAt: string;
}
