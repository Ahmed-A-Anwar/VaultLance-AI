"""
VaultPay – EvidenceChunk Model
================================
A chunk is a semantically meaningful slice of text extracted from a file.
Chunks are indexed in Elasticsearch for hybrid keyword + vector search.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, DateTime, Float, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: EvidenceChunk table
# ─────────────────────────────────────────────────────────────────────────────
class EvidenceChunk(Base):
    __tablename__ = "evidence_chunks"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign key to the source file
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uploaded_files.id", ondelete="CASCADE"), nullable=False
    )

    # Content
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Provenance (where exactly this chunk came from)
    page_number: Mapped[int | None] = mapped_column(Integer)        # PDF page
    line_start: Mapped[int | None] = mapped_column(Integer)         # source-code lines
    line_end: Mapped[int | None] = mapped_column(Integer)
    byte_start: Mapped[int | None] = mapped_column(Integer)
    byte_end: Mapped[int | None] = mapped_column(Integer)

    # Quality flags
    is_ocr_derived: Mapped[bool] = mapped_column(Boolean, default=False)  # lower reliability
    extraction_warning: Mapped[str | None] = mapped_column(Text)

    # Elasticsearch document ID (so we can link DB ↔ ES)
    es_doc_id: Mapped[str | None] = mapped_column(String(64))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    source_file: Mapped["UploadedFile"] = relationship("UploadedFile", back_populates="chunks")
