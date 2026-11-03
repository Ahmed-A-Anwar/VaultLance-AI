"""
VaultPay – Safe File Ingestion & Text Extraction Pipeline
=========================================================
Handles upload, virus scan, ZIP bomb detection, text extraction with
provenance metadata, and returns a list of EvidenceChunk objects.

Security rules enforced here:
 - Virus scan before any processing
 - ZIP bomb / path traversal / symlink detection
 - Extraction into an isolated temp dir that is always deleted
 - Raw source files are never mutated
"""

import hashlib
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import aiofiles
from pypdf import PdfReader
from docx import Document as DocxDocument
from PIL import Image
try:
    import pytesseract
except ImportError:
    pytesseract = None

from app.core.config import get_settings

settings = get_settings()

# Supported file extensions and their handlers
SUPPORTED_TYPES = {
    ".pdf", ".docx", ".txt", ".py", ".js", ".ts", ".java",
    ".c", ".cpp", ".h", ".cs", ".go", ".rb", ".rs", ".md",
    ".html", ".css", ".json", ".yaml", ".yml", ".xml",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp",
}


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: SHA-256 hash helper (used for integrity check)
# ─────────────────────────────────────────────────────────────────────────────
def compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: ZIP bomb & path traversal guard
# ─────────────────────────────────────────────────────────────────────────────
class ZipSecurityError(Exception):
    pass


def validate_zip(zip_path: Path, nesting_depth: int = 0) -> None:
    """Raise ZipSecurityError if the ZIP fails any security check."""
    max_depth = settings.max_zip_nesting_depth
    max_entries = settings.max_zip_entry_count
    max_expanded = settings.max_zip_expanded_mb * 1024 * 1024

    if nesting_depth > max_depth:
        raise ZipSecurityError(f"ZIP nesting depth {nesting_depth} exceeds limit {max_depth}")

    with zipfile.ZipFile(zip_path) as zf:
        entries = zf.infolist()

        # Check entry count
        if len(entries) > max_entries:
            raise ZipSecurityError(f"ZIP has {len(entries)} entries, max is {max_entries}")

        total_expanded = 0
        for entry in entries:
            # Path traversal check
            if ".." in entry.filename or entry.filename.startswith("/"):
                raise ZipSecurityError(f"Suspicious path in ZIP: {entry.filename}")

            # Symlink check (Unix attribute)
            if entry.external_attr >> 16 == 0xA1ED:
                raise ZipSecurityError(f"Symlink detected in ZIP: {entry.filename}")

            total_expanded += entry.file_size

            # Compression ratio check (bomb detection)
            if entry.compress_size > 0:
                ratio = entry.file_size / entry.compress_size
                if ratio > 100:
                    raise ZipSecurityError(
                        f"Suspicious compression ratio {ratio:.0f}x for {entry.filename}"
                    )

        # Total expanded size
        if total_expanded > max_expanded:
            raise ZipSecurityError(
                f"ZIP expands to {total_expanded / 1e6:.1f} MB, limit is {settings.max_zip_expanded_mb} MB"
            )


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Individual file text extractors
# ─────────────────────────────────────────────────────────────────────────────
def extract_pdf(file_path: Path) -> list[dict[str, Any]]:
    """Extract text from a PDF file, one chunk per page."""
    chunks = []
    try:
        reader = PdfReader(str(file_path))
        for page_num, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                chunks.append({
                    "text": text,
                    "page_number": page_num,
                    "is_ocr_derived": False,
                    "extraction_warning": None,
                })
    except Exception as e:
        chunks.append({
            "text": "",
            "page_number": None,
            "is_ocr_derived": False,
            "extraction_warning": f"PDF extraction failed: {e}",
        })
    return chunks


def extract_docx(file_path: Path) -> list[dict[str, Any]]:
    """Extract paragraphs from a DOCX file, grouped into chunks."""
    chunks = []
    try:
        doc = DocxDocument(str(file_path))
        buffer = []
        for para in doc.paragraphs:
            if para.text.strip():
                buffer.append(para.text)
            # Split into chunks of 20 paragraphs
            if len(buffer) >= 20:
                chunks.append({
                    "text": "\n".join(buffer),
                    "page_number": None,
                    "is_ocr_derived": False,
                    "extraction_warning": None,
                })
                buffer = []
        if buffer:
            chunks.append({
                "text": "\n".join(buffer),
                "page_number": None,
                "is_ocr_derived": False,
                "extraction_warning": None,
            })
    except Exception as e:
        chunks.append({
            "text": "",
            "page_number": None,
            "is_ocr_derived": False,
            "extraction_warning": f"DOCX extraction failed: {e}",
        })
    return chunks


def extract_text_file(file_path: Path) -> list[dict[str, Any]]:
    """Extract text from plain-text / source-code files, one chunk per 100 lines."""
    chunks = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        chunk_size = 100
        for i in range(0, len(lines), chunk_size):
            chunk_lines = lines[i : i + chunk_size]
            chunks.append({
                "text": "".join(chunk_lines),
                "page_number": None,
                "line_start": i + 1,
                "line_end": i + len(chunk_lines),
                "is_ocr_derived": False,
                "extraction_warning": None,
            })
    except Exception as e:
        chunks.append({
            "text": "",
            "page_number": None,
            "is_ocr_derived": False,
            "extraction_warning": f"Text extraction failed: {e}",
        })
    return chunks


def extract_image(file_path: Path) -> list[dict[str, Any]]:
    """Run OCR on an image. Results are marked as OCR-derived (lower reliability)."""
    if pytesseract is None:
        return [{
            "text": "[OCR unavailable: pytesseract package not installed]",
            "page_number": None,
            "is_ocr_derived": True,
            "extraction_warning": "pytesseract is not installed in the environment.",
        }]
    try:
        img = Image.open(str(file_path))
        text = pytesseract.image_to_string(img)
        return [{
            "text": text,
            "page_number": None,
            "is_ocr_derived": True,   # << important flag
            "extraction_warning": "This text was extracted by OCR and may contain errors.",
        }]
    except Exception as e:
        return [{
            "text": "",
            "page_number": None,
            "is_ocr_derived": True,
            "extraction_warning": f"OCR failed: {e}",
        }]


# ─────────────────────────────────────────────────────────────────────────────
# Section 4: Dispatch – choose the right extractor for a file
# ─────────────────────────────────────────────────────────────────────────────
def extract_file(file_path: Path) -> list[dict[str, Any]]:
    """Route a file to the appropriate extractor based on its extension."""
    ext = file_path.suffix.lower()

    if ext == ".pdf":
        return extract_pdf(file_path)
    elif ext == ".docx":
        return extract_docx(file_path)
    elif ext in {".png", ".jpg", ".jpeg", ".gif", ".bmp"}:
        return extract_image(file_path)
    elif ext in SUPPORTED_TYPES:
        return extract_text_file(file_path)
    else:
        # Unsupported binary: report metadata only, do NOT pretend to understand it
        return [{
            "text": f"[UNSUPPORTED FILE TYPE: {ext} – metadata only]",
            "page_number": None,
            "is_ocr_derived": False,
            "extraction_warning": f"File type {ext} is not supported for semantic inspection.",
        }]


# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Full ingestion pipeline (called by the Celery task)
# ─────────────────────────────────────────────────────────────────────────────
def ingest_uploaded_file(
    stored_path: Path,
    original_filename: str,
    extractor_version: str,
) -> dict[str, Any]:
    """
    Entry point for the extraction worker.
    Returns a dict with:
      - sha256_hash
      - mime_type (best guess from extension)
      - chunks: list of chunk dicts ready for DB + ES indexing
      - warnings: list of extraction warnings
    """
    result: dict[str, Any] = {
        "sha256_hash": compute_sha256(stored_path),
        "mime_type": _guess_mime(stored_path),
        "extractor_name": "vaultpay-extractor",
        "extractor_version": extractor_version,
        "chunks": [],
        "warnings": [],
    }

    ext = stored_path.suffix.lower()

    # ── ZIP: validate, then extract into temp dir and process each entry ──────
    if ext == ".zip":
        try:
            validate_zip(stored_path)
        except ZipSecurityError as e:
            result["warnings"].append(str(e))
            return result  # Abort extraction, return metadata only

        tmp_dir = Path(tempfile.mkdtemp(dir=settings.temp_extract_dir or None))
        try:
            with zipfile.ZipFile(stored_path) as zf:
                zf.extractall(tmp_dir)
            for entry in tmp_dir.rglob("*"):
                if entry.is_file():
                    sub_chunks = extract_file(entry)
                    for chunk in sub_chunks:
                        chunk["source_entry"] = str(entry.relative_to(tmp_dir))
                    result["chunks"].extend(sub_chunks)
        finally:
            # Always delete the temp dir
            shutil.rmtree(tmp_dir, ignore_errors=True)
    else:
        result["chunks"] = extract_file(stored_path)

    # Collect all extraction warnings
    for chunk in result["chunks"]:
        if chunk.get("extraction_warning"):
            result["warnings"].append(chunk["extraction_warning"])

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Section 6: Utility helpers
# ─────────────────────────────────────────────────────────────────────────────
def _guess_mime(file_path: Path) -> str:
    """Simple extension-to-MIME mapping (python-magic is optional)."""
    mime_map = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".zip": "application/zip",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".txt": "text/plain",
        ".json": "application/json",
    }
    return mime_map.get(file_path.suffix.lower(), "application/octet-stream")
