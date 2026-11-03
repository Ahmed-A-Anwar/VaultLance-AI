"""
VaultPay – UploadedFile Model
==============================
Represents a file uploaded by the freelancer as a deliverable.
Stores provenance metadata so every extracted chunk can be traced back.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: UploadedFile table
# ─────────────────────────────────────────────────────────────────────────────
class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign key to project
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )

    # File identity
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)  # path on disk
    mime_type: Mapped[str] = mapped_column(String(128))
    file_size_bytes: Mapped[int] = mapped_column(Integer)
    sha256_hash: Mapped[str] = mapped_column(String(64))  # integrity check

    # Safety
    virus_scan_passed: Mapped[bool | None] = mapped_column(Boolean)  # None = not scanned
    extraction_warnings: Mapped[str | None] = mapped_column(Text)    # JSON list of warning strings

    # Extractor provenance
    extractor_name: Mapped[str | None] = mapped_column(String(64))
    extractor_version: Mapped[str | None] = mapped_column(String(32))

    # Timestamps
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="uploaded_files")
    chunks: Mapped[list["EvidenceChunk"]] = relationship(
        "EvidenceChunk", back_populates="source_file", cascade="all, delete-orphan"
    )
