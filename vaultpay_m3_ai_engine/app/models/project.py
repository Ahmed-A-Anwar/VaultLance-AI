"""
VaultPay – Project & Acceptance Criteria Models
================================================
A Project represents a freelance contract.  Each project has a brief and
a list of AcceptanceCriteria extracted from that brief by the LLM.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Boolean, ForeignKey, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.db.base import Base


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Enumerations
# ─────────────────────────────────────────────────────────────────────────────
class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    IN_VERIFICATION = "in_verification"
    COMPLETED = "completed"
    DISPUTED = "disputed"


class CriteriaSeverity(str, enum.Enum):
    CRITICAL = "critical"    # FAIL → overall FAIL
    MAJOR = "major"
    MINOR = "minor"


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Project table
# ─────────────────────────────────────────────────────────────────────────────
class Project(Base):
    __tablename__ = "projects"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Basic metadata
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    brief: Mapped[str] = mapped_column(Text, nullable=False)  # raw brief submitted by client
    agreement_hash: Mapped[str | None] = mapped_column(String(64))  # SHA-256 of approved agreement
    agreement_version: Mapped[int] = mapped_column(default=0)

    # Approval flags – payment is blocked until both sides agree on criteria
    client_approved_criteria: Mapped[bool] = mapped_column(Boolean, default=False)
    freelancer_approved_criteria: Mapped[bool] = mapped_column(Boolean, default=False)

    # Lifecycle
    status: Mapped[ProjectStatus] = mapped_column(
        SAEnum(ProjectStatus, name="project_status"), default=ProjectStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    criteria: Mapped[list["AcceptanceCriterion"]] = relationship(
        "AcceptanceCriterion", back_populates="project", cascade="all, delete-orphan"
    )
    verification_runs: Mapped[list["VerificationRun"]] = relationship(
        "VerificationRun", back_populates="project", cascade="all, delete-orphan"
    )
    uploaded_files: Mapped[list["UploadedFile"]] = relationship(
        "UploadedFile", back_populates="project", cascade="all, delete-orphan"
    )
    paypal_orders: Mapped[list["PayPalOrder"]] = relationship(
        "PayPalOrder", back_populates="project", cascade="all, delete-orphan"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: AcceptanceCriterion table
# ─────────────────────────────────────────────────────────────────────────────
class AcceptanceCriterion(Base):
    __tablename__ = "acceptance_criteria"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Stable human-readable ID (e.g. "C-001") so LLM can reference it by name
    stable_id: Mapped[str] = mapped_column(String(16), nullable=False)

    # Foreign key to project
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )

    # Criterion content (populated by LLM parsing)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    measurable_test: Mapped[str] = mapped_column(Text, nullable=False)
    required_evidence_type: Mapped[str] = mapped_column(String(100))  # e.g. "screenshot", "code"
    severity: Mapped[CriteriaSeverity] = mapped_column(
        SAEnum(CriteriaSeverity, name="criteria_severity"), default=CriteriaSeverity.MAJOR
    )
    automated_verifiable: Mapped[bool] = mapped_column(Boolean, default=False)

    # Agreement tracking
    agreement_version: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    project: Mapped["Project"] = relationship("Project", back_populates="criteria")
    criterion_results: Mapped[list["CriterionResult"]] = relationship(
        "CriterionResult", back_populates="criterion"
    )
