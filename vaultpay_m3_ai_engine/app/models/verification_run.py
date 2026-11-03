"""
VaultPay – VerificationRun & CriterionResult Models
=====================================================
A VerificationRun is triggered when a freelancer submits deliverables for review.
For each AcceptanceCriterion, a CriterionResult is produced (PASS / FAIL / etc.).
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Text, Float, ForeignKey, DateTime, Enum as SAEnum, func, Integer, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import enum

from app.db.base import Base


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Enumerations
# ─────────────────────────────────────────────────────────────────────────────
class RunStatus(str, enum.Enum):
    PENDING = "pending"
    EXTRACTING = "extracting"
    VERIFYING = "verifying"
    DONE = "done"
    ERROR = "error"


class Verdict(str, enum.Enum):
    PASS = "PASS"
    PARTIAL = "PARTIAL"
    FAIL = "FAIL"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class VerificationMethod(str, enum.Enum):
    DETERMINISTIC = "deterministic"
    AI = "AI"


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: VerificationRun table
# ─────────────────────────────────────────────────────────────────────────────
class VerificationRun(Base):
    __tablename__ = "verification_runs"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign key to project
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )

    # Overall verdict (PASS only if all CRITICAL criteria pass)
    overall_verdict: Mapped[Verdict | None] = mapped_column(
        SAEnum(Verdict, name="verdict_enum", create_constraint=False)
    )
    status: Mapped[RunStatus] = mapped_column(
        SAEnum(RunStatus, name="run_status"), default=RunStatus.PENDING
    )

    # Reproducibility metadata
    model_name: Mapped[str | None] = mapped_column(String(64))
    model_version: Mapped[str | None] = mapped_column(String(32))
    prompt_version: Mapped[str | None] = mapped_column(String(16))
    extractor_version: Mapped[str | None] = mapped_column(String(16))

    # Error info (if status == ERROR)
    error_message: Mapped[str | None] = mapped_column(Text)

    # Timestamps
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="verification_runs")
    criterion_results: Mapped[list["CriterionResult"]] = relationship(
        "CriterionResult", back_populates="run", cascade="all, delete-orphan"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: CriterionResult table
# ─────────────────────────────────────────────────────────────────────────────
class CriterionResult(Base):
    __tablename__ = "criterion_results"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("verification_runs.id", ondelete="CASCADE"), nullable=False
    )
    criterion_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("acceptance_criteria.id", ondelete="CASCADE"), nullable=False
    )

    # Verdict
    verdict: Mapped[Verdict] = mapped_column(SAEnum(Verdict, name="verdict_enum", create_constraint=False))
    explanation: Mapped[str] = mapped_column(Text, nullable=False)

    # Evidence cited (list of EvidenceChunk IDs + file/page references)
    cited_evidence: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"))   # [{chunk_id, file, page, excerpt}]
    missing_evidence: Mapped[str | None] = mapped_column(Text)   # plain-text description

    # Confidence (labelled as ESTIMATE – not a calibrated probability)
    confidence_estimate: Mapped[float | None] = mapped_column(Float)  # 0.0 – 1.0, label: estimate

    # Method
    verification_method: Mapped[VerificationMethod] = mapped_column(
        SAEnum(VerificationMethod, name="verification_method"), default=VerificationMethod.AI
    )
    limitations: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    run: Mapped["VerificationRun"] = relationship("VerificationRun", back_populates="criterion_results")
    criterion: Mapped["AcceptanceCriterion"] = relationship(
        "AcceptanceCriterion", back_populates="criterion_results"
    )
