# Step 9 – Manifest & SHA-256 Canonicalization & Reproducibility

## Overview
Step 9 implements the sealed document model: generating a deterministic, canonical cryptographic manifest for all deliverables in a vault, calculating SHA-256 hashes server-side, sorting entries by stable identifier, and verifying 100% bit-for-bit reproducibility.

---

## 1. Directory Structure

```
steps/step-09-manifest-sha256/
├── manifests/
│   ├── manifest.types.ts       # Types for manifest entries and verification
│   ├── canonical.ts            # Canonical JSON serialization & stable sort
│   ├── manifest.service.ts     # Manifest generation and reproducibility check
│   └── manifest.routes.ts      # REST API endpoints
└── tests/
    └── manifest.test.ts        # Complete test suite (2 tests)
```

---

## 2. Canonical Manifest Architecture

1. **Server-Side SHA-256 Calculation**
   - Each file's SHA-256 digest is computed using Node.js `crypto.createHash('sha256')` during upload.
   - Stored in the database metadata table.

2. **Deterministic Stable Identifier Sorting**
   - Files are sorted in ascending lexicographical order by normalized relative path / filename (`normalizedPath.toLowerCase()`).
   - Tie-breaking is performed using the immutable file UUID identifier.
   - Eliminates operating system-specific filesystem directory ordering differences.

3. **Canonical JSON Serialization (`canonicalJsonStringify`)**
   - Recursively sorts object keys alphabetically.
   - Eliminates whitespace variations and key-order nondeterminism.
   - Formats numbers, strings, and arrays with RFC-compliant deterministic serialization.

4. **Manifest Hashing**
   - The final canonical manifest string is hashed with SHA-256:
     ```
     manifestHash = SHA256(canonicalManifestString)
     ```

5. **Reproducibility Guarantee**
   - Running the generation algorithm on the same file set at any point in time produces the exact same cryptographic hash bit-for-bit.

---

## 3. Endpoints

### `GET /api/manifests/:vaultId`
- **Guards**: `requireAuth` (vault participants only)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Canonical manifest generated successfully",
    "data": {
      "vaultId": "e44d82ec-fa6c-48b4-92ee-48cbb33658dc",
      "totalFiles": 3,
      "totalSizeBytes": 84210,
      "files": [
        {
          "id": "...",
          "fileName": "alpha.txt",
          "normalizedPath": "alpha.txt",
          "sizeBytes": 1240,
          "mimeType": "text/plain",
          "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a"
        },
        {
          "id": "...",
          "fileName": "beta.txt",
          "normalizedPath": "beta.txt",
          "sizeBytes": 3200,
          "mimeType": "text/plain",
          "sha256": "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d"
        }
      ],
      "canonicalString": "{\"files\":[...],\"totalFiles\":2,\"totalSizeBytes\":4440,\"vaultId\":\"...\"}",
      "manifestHash": "8f4e2...3e"
    }
  }
  ```

### `POST /api/manifests/:vaultId/verify`
- **Guards**: `requireAuth`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Manifest reproducibility verified",
    "data": {
      "verified": true,
      "expectedHash": "8f4e2...3e",
      "computedHash": "8f4e2...3e",
      "totalFiles": 2,
      "reproducible": true,
      "checkedAt": "2026-11-02T15:20:00.000Z"
    }
  }
  ```

---

## 4. Verification & Testing
Run tests:
```bash
npm test tests/manifest.test.ts
```
Covers:
- Generating canonical manifest sorted deterministically by stable identifier.
- Verifying 100% bit-for-bit hash reproducibility across multiple distinct runs.
