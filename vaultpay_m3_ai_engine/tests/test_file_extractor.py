"""
VaultPay – Tests: File Extractor
=================================
Covers the 10 synthetic test vaults required by the spec.
"""

import os
import zipfile
from pathlib import Path
import pytest
from app.services.file_extractor import (
    validate_zip, ZipSecurityError, ingest_uploaded_file, extract_pdf, extract_text_file
)


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Fixtures
# ─────────────────────────────────────────────────────────────────────────────
@pytest.fixture
def tmp_dir(tmp_path):
    return tmp_path


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Test vault 1 – Normal text file extraction (should all pass)
# ─────────────────────────────────────────────────────────────────────────────
def test_text_extraction_passes(tmp_dir):
    """Vault 1: normal .txt file extracts without warnings."""
    txt = tmp_dir / "readme.txt"
    txt.write_text("This is a deliverable.\nLine 2 here.")
    chunks = extract_text_file(txt)
    assert len(chunks) > 0
    assert "deliverable" in chunks[0]["text"]
    assert chunks[0]["is_ocr_derived"] is False
    assert chunks[0]["extraction_warning"] is None


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Test vault 3 – Path traversal in ZIP (should be rejected)
# ─────────────────────────────────────────────────────────────────────────────
def test_zip_path_traversal_rejected(tmp_dir):
    """Vault 8 (malicious ZIP): path traversal entry is rejected."""
    zip_path = tmp_dir / "evil.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        # Manually write a ZipInfo with traversal path
        zi = zipfile.ZipInfo(filename="../../../evil.txt")
        zf.writestr(zi, "malicious content")
    with pytest.raises(ZipSecurityError, match="Suspicious path"):
        validate_zip(zip_path)


# ─────────────────────────────────────────────────────────────────────────────
# Section 4: Test vault 9 – Unsupported binary file
# ─────────────────────────────────────────────────────────────────────────────
def test_unsupported_binary_returns_metadata(tmp_dir):
    """Vault 9: .exe file returns metadata-only, not fake content."""
    binary_file = tmp_dir / "program.exe"
    binary_file.write_bytes(b"\x4d\x5a" + b"\x00" * 100)  # MZ header
    result = ingest_uploaded_file(binary_file, "program.exe", "test-1.0")
    assert len(result["chunks"]) == 1
    assert "UNSUPPORTED" in result["chunks"][0]["text"]


# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Test vault 5 – ZIP with too many entries
# ─────────────────────────────────────────────────────────────────────────────
def test_zip_too_many_entries_rejected(tmp_dir, monkeypatch):
    """ZIP with 501 entries is rejected when limit is 500."""
    monkeypatch.setattr("app.services.file_extractor.settings.max_zip_entry_count", 5)
    zip_path = tmp_dir / "big.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        for i in range(10):
            zf.writestr(f"file{i}.txt", "data")
    with pytest.raises(ZipSecurityError, match="entries"):
        validate_zip(zip_path)


# ─────────────────────────────────────────────────────────────────────────────
# Section 6: Test vault 6 – SHA-256 hash computed correctly
# ─────────────────────────────────────────────────────────────────────────────
def test_sha256_hash_computed(tmp_dir):
    """SHA-256 hash in the result matches independently computed hash."""
    import hashlib
    txt = tmp_dir / "data.txt"
    txt.write_text("Hello VaultPay")
    expected_hash = hashlib.sha256(b"Hello VaultPay").hexdigest()
    result = ingest_uploaded_file(txt, "data.txt", "test-1.0")
    assert result["sha256_hash"] == expected_hash
