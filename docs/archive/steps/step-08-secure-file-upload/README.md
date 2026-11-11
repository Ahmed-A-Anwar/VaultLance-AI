# Step 8 – Secure File Upload & ZIP Security Checks

## Overview
Step 8 implements an enterprise-grade secure multipart file upload pipeline with defense-in-depth against malicious file uploads, executable code injection, double-extension attacks, Zip Slip directory traversals, and Zip Bombs.

---

## 1. Directory Structure

```
steps/step-08-secure-file-upload/
├── uploads/
│   ├── upload.config.ts        # Max size limits, MIME types, dangerous extensions
│   ├── zip.validator.ts        # Deep ZIP inspection (Zip Slip, Zip Bomb, Executables)
│   ├── storage.adapter.ts      # Private disk/bucket storage adapter
│   ├── upload.middleware.ts    # Multer multipart stream & initial inspection
│   ├── upload.service.ts       # Upload processor, SHA-256 calculation & key generation
│   └── upload.routes.ts        # Upload & download endpoints
└── tests/
    └── upload-security.test.ts # Complete test suite (5 tests)
```

---

## 2. Security Protections & Defenses

1. **File Size Limits**
   - Individual file limit: `50MB`.
   - Total uncompressed ZIP archive limit: `200MB`.
   - Max files per ZIP archive: `1,000` entries (prevents inode exhaustion).

2. **MIME Allowlist & Extension Validation**
   - Strict allowlist: `.zip`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.txt`, `.md`, `.json`.
   - Rejects arbitrary executables (`.exe`, `.bat`, `.cmd`, `.sh`, `.vbs`, `.dll`, `.ps1`).

3. **Double-Extension Attack Defense**
   - Detects and rejects filenames with deceptive secondary extensions (e.g. `payload.exe.zip` or `exploit.sh.png`).

4. **Zip Slip Vulnerability Defense**
   - Inspects entry headers inside ZIP archives before extraction.
   - Detects `../`, `..\`, absolute paths, or path traversal escaping root.
   - Immediately throws `ZIP_SLIP_DETECTED`.

5. **Zip Bomb / Decompression Ratio Check**
   - Compares uncompressed size vs compressed size for each entry.
   - Rejects any entry exceeding a compression ratio of `100:1` (`ZIP_BOMB_DETECTED`).

6. **Generated Object Keys & Private Storage**
   - File is never stored using the raw user-supplied filename.
   - Generates randomized cryptographic UUID key: `vault-<vaultId>-<uuid>.<ext>`.
   - Stored in a private directory with restricted permissions (`0o600` / `0o700`).
   - Downloads are served via authenticated streaming with `Content-Disposition: attachment`.

---

## 3. Endpoints

### `POST /api/uploads/:vaultId`
- **Guards**: `requireAuth`, `requireRole('FREELANCER')` (only vault owner can upload)
- **Form Data**: `file` (binary stream)
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "File uploaded and verified successfully",
    "data": {
      "fileId": "651da039-4d22-44df-b45d-4f1073e51a6d",
      "vaultId": "...",
      "fileName": "deliverable.zip",
      "storageKey": "vault-095...-651da039.zip",
      "mimeType": "application/zip",
      "fileSize": 154200,
      "sha256Hash": "a1b2c3d4e5f6...",
      "isZipArchive": true,
      "zipDetails": {
        "totalEntries": 4,
        "totalUncompressedSize": 412500
      }
    }
  }
  ```

### `GET /api/uploads/download/:fileId`
- **Guards**: `requireAuth` (only authorized vault participants can download)
- **Response**: Streams binary file with sanitized headers.

---

## 4. Verification & Testing
Run tests:
```bash
npm test tests/upload-security.test.ts
```
Covers:
- Uploading valid text/ZIP file and verifying SHA-256 and randomized storage key.
- Rejecting executable `.exe` files with `DISALLOWED_FILE_EXTENSION`.
- Rejecting double-extension files (`payload.exe.zip`) with `DOUBLE_EXTENSION_ATTACK`.
- Catching and rejecting Zip Slip attacks (`../../../traversal.txt`) with `ZIP_SLIP_DETECTED`.
- Detecting dangerous binaries inside ZIP archives (`DANGEROUS_FILE_EXTENSION`).
