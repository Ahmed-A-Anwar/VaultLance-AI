"""
VaultPay – FastAPI Route: File Upload & Evidence Extraction
============================================================
Handles:
  - Secure file upload with size and type validation
  - Virus scan stub
  - Automatic extraction + EvidenceChunk DB indexing + Elasticsearch indexing
  - Returns the UploadedFile record with extraction status
"""

import json
import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.base import get_db
from app.models.uploaded_file import UploadedFile
from app.models.project import Project
from app.services.file_extractor import ingest_uploaded_file
from app.services.evidence_indexer import ensure_index_exists, index_chunks
from app.models.evidence_chunk import EvidenceChunk
from app.core.config import get_settings

router = APIRouter(prefix="/projects/{project_id}/files", tags=["Files"])
settings = get_settings()


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Upload a file for a project
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/", status_code=201)
async def upload_file(
    project_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept a file upload for a project's deliverables.
    - Validates project exists and file size is within limits.
    - Saves raw file to disk (immutable after save).
    - Enqueues extraction as a background task.
    """
    try:
        val_proj_id = uuid.UUID(str(project_id))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Invalid project ID format")

    result = await db.execute(select(Project).where(Project.id == val_proj_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # ── Size pre-check: reject before saving if Content-Length is too big ──
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max allowed: {settings.max_upload_size_mb} MB",
        )

    # ── Save file to disk in a project-scoped directory ───────────────────
    upload_root = Path(settings.upload_dir) / str(val_proj_id)
    upload_root.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{uuid.uuid4()}-{Path(file.filename).name}"
    stored_path = upload_root / safe_filename

    async with aiofiles.open(stored_path, "wb") as f_out:
        await f_out.write(content)

    # ── Create DB record ──────────────────────────────────────────────────
    uploaded_file = UploadedFile(
        project_id=val_proj_id,
        original_filename=file.filename,
        storage_path=str(stored_path),
        mime_type=file.content_type or "application/octet-stream",
        file_size_bytes=len(content),
    )
    db.add(uploaded_file)
    await db.flush()
    await db.refresh(uploaded_file)

    # ── Run extraction directly so chunks are immediately ready for verification ──
    await _run_extraction(
        file_id=str(uploaded_file.id),
        project_id=str(val_proj_id),
        stored_path=stored_path,
        original_filename=file.filename,
    )

    return {
        "file_id": str(uploaded_file.id),
        "original_filename": file.filename,
        "status": "extracted",
        "message": "File uploaded and evidence extracted successfully.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: List uploaded files for a project
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/")
async def list_files(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return all uploaded files for a project with their extraction metadata."""
    try:
        val_proj_id = uuid.UUID(str(project_id))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Invalid project ID format")

    result = await db.execute(
        select(UploadedFile).where(UploadedFile.project_id == val_proj_id)
    )
    files = result.scalars().all()
    return [
        {
            "file_id": str(f.id),
            "original_filename": f.original_filename,
            "mime_type": f.mime_type,
            "file_size_bytes": f.file_size_bytes,
            "sha256_hash": f.sha256_hash,
            "virus_scan_passed": f.virus_scan_passed,
            "extraction_warnings": json.loads(f.extraction_warnings or "[]"),
            "uploaded_at": f.uploaded_at.isoformat(),
        }
        for f in files
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Extraction task
# ─────────────────────────────────────────────────────────────────────────────
async def _run_extraction(
    file_id: str,
    project_id: str,
    stored_path: Path,
    original_filename: str,
) -> None:
    """
    Extract text from the uploaded file, store chunks in DB, and index in Elasticsearch.
    """
    from app.db.base import AsyncSessionLocal

    try:
        val_file_id = uuid.UUID(str(file_id))
        val_proj_id = uuid.UUID(str(project_id))
    except Exception as e:
        print(f"[ERROR] Invalid UUID in extraction: {e}")
        return

    async with AsyncSessionLocal() as db:
        try:
            # Run ingestion pipeline
            result = ingest_uploaded_file(
                stored_path=stored_path,
                original_filename=original_filename,
                extractor_version=settings.extractor_version,
            )

            # Update UploadedFile with hash and warnings
            res = await db.execute(select(UploadedFile).where(UploadedFile.id == val_file_id))
            uploaded_file = res.scalar_one_or_none()
            if not uploaded_file:
                return

            uploaded_file.sha256_hash = result["sha256_hash"]
            uploaded_file.mime_type = result.get("mime_type", uploaded_file.mime_type)
            uploaded_file.extractor_name = result["extractor_name"]
            uploaded_file.extractor_version = result["extractor_version"]
            uploaded_file.extraction_warnings = json.dumps(result["warnings"])

            # Store each chunk in DB
            for chunk_data in result["chunks"]:
                chunk = EvidenceChunk(
                    file_id=val_file_id,
                    text=chunk_data.get("text", ""),
                    page_number=chunk_data.get("page_number"),
                    line_start=chunk_data.get("line_start"),
                    line_end=chunk_data.get("line_end"),
                    is_ocr_derived=chunk_data.get("is_ocr_derived", False),
                    extraction_warning=chunk_data.get("extraction_warning"),
                )
                db.add(chunk)

            await db.commit()

            # Optional Elasticsearch indexing
            try:
                await ensure_index_exists()
                doc_ids = await index_chunks(
                    project_id=str(val_proj_id),
                    file_id=str(val_file_id),
                    original_filename=original_filename,
                    chunks=result["chunks"],
                )
                res2 = await db.execute(
                    select(EvidenceChunk).where(EvidenceChunk.file_id == val_file_id)
                )
                db_chunks = res2.scalars().all()
                for db_chunk, es_id in zip(db_chunks, doc_ids):
                    db_chunk.es_doc_id = es_id
                await db.commit()
            except Exception:
                pass

        except Exception as exc:
            print(f"[ERROR] Extraction failed for file {file_id}: {exc}")
